import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { ECHART_RL_THEME, ECHART_THEME_NAME } from '../../../core/charts/echarts-rl.theme';

type EChartsCore = typeof import('echarts/core');

let echartsRuntimePromise: Promise<EChartsCore> | null = null;
let themeRegistered = false;

async function loadEchartsRuntime(): Promise<EChartsCore> {
  if (!echartsRuntimePromise) {
    echartsRuntimePromise = Promise.all([
      import('echarts/core'),
      import('echarts/charts'),
      import('echarts/components'),
      import('echarts/renderers'),
    ]).then(([core, charts, components, renderers]) => {
      core.use([
        charts.BarChart,
        charts.FunnelChart,
        charts.GaugeChart,
        charts.LineChart,
        charts.PieChart,
        charts.RadarChart,
        components.GridComponent,
        components.LegendComponent,
        components.TitleComponent,
        components.TooltipComponent,
        renderers.CanvasRenderer,
      ]);
      if (!themeRegistered) {
        core.registerTheme(ECHART_THEME_NAME, ECHART_RL_THEME as Record<string, unknown>);
        themeRegistered = true;
      }
      return core;
    });
  }
  return echartsRuntimePromise;
}

export type EChartOptions = EChartsCoreOption;

@Component({
  selector: 'rl-echart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="rl-echart__host"></div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: var(--rl-echart-height, 260px);
      }
      .rl-echart__host {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class EchartComponent implements AfterViewInit, OnDestroy {
  readonly options = input.required<EChartOptions>();
  readonly theme = input<string>(ECHART_THEME_NAME);
  readonly autoResize = input(true);

  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private chart: ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private initializing = false;

  constructor() {
    effect(() => {
      const opts = this.options();
      if (this.chart) {
        this.chart.setOption(opts, { notMerge: true });
      }
    });
  }

  ngAfterViewInit(): void {
    this.tryInit();
    if (this.autoResize() && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        const el = this.hostRef().nativeElement;
        if (el.clientWidth === 0 || el.clientHeight === 0) return;
        if (!this.chart) this.tryInit();
        else this.chart.resize();
      });
      this.resizeObserver.observe(this.hostRef().nativeElement);
    }
  }

  private tryInit(): void {
    if (this.chart || this.initializing) return;
    const el = this.hostRef().nativeElement;
    if (el.clientWidth === 0 || el.clientHeight === 0) return;
    this.initializing = true;
    void loadEchartsRuntime()
      .then((echarts) => {
        const currentEl = this.hostRef().nativeElement;
        if (this.chart || currentEl.clientWidth === 0 || currentEl.clientHeight === 0) return;
        this.chart = echarts.init(currentEl, this.theme(), { renderer: 'canvas' });
        this.chart.setOption(this.options(), { notMerge: true });
      })
      .finally(() => {
        this.initializing = false;
      });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.chart?.dispose();
    this.chart = null;
  }
}
