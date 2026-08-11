import {
  Component,
  OnInit,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { UserConfigStore } from '../../stores/user-config.store';
import type { CompetitorProfile } from '../../models/user-config.model';

@Component({
  standalone: true,
  selector: 'rl-settings-page',
  encapsulation: ViewEncapsulation.None,
  imports: [ReactiveFormsModule, IonContent],
  template: `
    <ion-content>
      <div class="rl-page">
        <h1 class="rl-page__title">Configuración</h1>
        <p class="rl-page__lead">
          Definí tu empresa y rivales. Los feeds de Propios y Competencia usan estos datos.
        </p>

        <form class="rl-settings" [formGroup]="form" (ngSubmit)="save()">
          <section class="rl-page__panel">
            <h2 class="rl-settings__h">Mi empresa</h2>
            <label class="rl-settings__label">
              Nombre de la marca
              <input class="rl-settings__input" formControlName="companyName" placeholder="Acme Inc." />
            </label>
            <label class="rl-settings__label">
              Qué venden
              <textarea
                class="rl-settings__input rl-settings__textarea"
                formControlName="whatTheySell"
                rows="3"
                placeholder="SaaS de facturación para PYMES…"
              ></textarea>
            </label>
            <label class="rl-settings__label">
              Links clave (uno por línea)
              <textarea
                class="rl-settings__input rl-settings__textarea"
                formControlName="keyLinksText"
                rows="3"
                placeholder="https://acme.com&#10;https://status.acme.com"
              ></textarea>
            </label>
            <label class="rl-settings__label">
              Notas de tono de marca
              <textarea
                class="rl-settings__input rl-settings__textarea"
                formControlName="brandVoiceNotes"
                rows="2"
                placeholder="Cercano, técnico, sin jerga…"
              ></textarea>
            </label>
          </section>

          <section class="rl-page__panel" formArrayName="competitors">
            <div class="rl-settings__row">
              <h2 class="rl-settings__h">Rivales</h2>
              <button type="button" class="rl-settings__ghost" (click)="addCompetitor()">+ Agregar rival</button>
            </div>

            @for (ctrl of competitors.controls; track $index; let i = $index) {
              <div class="rl-settings__rival" [formGroupName]="i">
                <label class="rl-settings__label">
                  Nombre
                  <input class="rl-settings__input" formControlName="name" placeholder="RivalCo" />
                </label>
                <label class="rl-settings__label">
                  Aliases (coma)
                  <input class="rl-settings__input" formControlName="aliasesText" placeholder="rival co, Rival" />
                </label>
                <label class="rl-settings__label">
                  Website
                  <input class="rl-settings__input" formControlName="websiteUrl" placeholder="https://…" />
                </label>
                <button type="button" class="rl-settings__ghost rl-settings__ghost--danger" (click)="removeCompetitor(i)">
                  Quitar
                </button>
              </div>
            } @empty {
              <p class="rl-settings__empty">Sin rivales todavía. Agregá al menos uno para Competencia.</p>
            }
          </section>

          @if (store.error(); as err) {
            <p class="rl-auth-gate__error">{{ err }}</p>
          }
          @if (store.savedOk()) {
            <p class="rl-auth-gate__notice">Configuración guardada.</p>
          }

          <button class="rl-auth-gate__submit" type="submit" [disabled]="form.invalid || store.saving()">
            {{ store.saving() ? 'Guardando…' : 'Guardar configuración' }}
          </button>
        </form>
      </div>
    </ion-content>
  `,
})
export class SettingsPageComponent implements OnInit {
  readonly store = inject(UserConfigStore);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    companyName: ['', Validators.required],
    whatTheySell: [''],
    keyLinksText: [''],
    brandVoiceNotes: [''],
    competitors: this.fb.array([] as ReturnType<SettingsPageComponent['competitorGroup']>[]),
  });

  get competitors(): FormArray {
    return this.form.controls.competitors;
  }

  ngOnInit(): void {
    this.store.load();
    const cfg = this.store.config();
    if (!cfg) return;
    this.form.patchValue({
      companyName: cfg.company.companyName,
      whatTheySell: cfg.company.whatTheySell,
      keyLinksText: cfg.company.keyLinks.join('\n'),
      brandVoiceNotes: cfg.company.brandVoiceNotes,
    });
    this.competitors.clear();
    for (const c of cfg.competitors) {
      this.competitors.push(this.competitorGroup(c));
    }
  }

  competitorGroup(c?: Partial<CompetitorProfile> & { aliasesText?: string }) {
    return this.fb.nonNullable.group({
      name: [c?.name ?? '', Validators.required],
      aliasesText: [(c?.aliases ?? []).join(', ')],
      websiteUrl: [c?.websiteUrl ?? ''],
    });
  }

  addCompetitor(): void {
    this.competitors.push(this.competitorGroup());
  }

  removeCompetitor(index: number): void {
    this.competitors.removeAt(index);
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const competitors: CompetitorProfile[] = v.competitors.map((c) => ({
      name: c.name,
      aliases: c.aliasesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      websiteUrl: c.websiteUrl,
      socialHandles: [],
    }));
    await this.store.save(
      {
        companyName: v.companyName,
        whatTheySell: v.whatTheySell,
        keyLinks: v.keyLinksText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        brandVoiceNotes: v.brandVoiceNotes,
      },
      competitors,
    );
  }
}
