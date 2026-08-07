#!/usr/bin/env bash
# Crea (o reutiliza) el OIDC provider de GitHub Actions y un rol IAM para CI/CD.
# Uso:
#   ./scripts/setup-github-oidc.sh --repo ORG/ResponseLens-AI
# Luego en GitHub → Secrets: AWS_DEPLOY_ROLE_ARN=<arn del rol impreso>
set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-}"
ROLE_NAME="${ROLE_NAME:-responselens-github-deploy}"
AWS_REGION="${AWS_REGION:-eu-central-1}"
OIDC_URL="https://token.actions.githubusercontent.com"
OIDC_AUDIENCE="sts.amazonaws.com"
GITHUB_OIDC_THUMBPRINT="${GITHUB_OIDC_THUMBPRINT:-6938fd4d98bab03faadb97b34396831e3780aea1}"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) GITHUB_REPO="$2"; shift 2 ;;
    --role-name) ROLE_NAME="$2"; shift 2 ;;
    --region) AWS_REGION="$2"; shift 2 ;;
    -h|--help)
      echo "Uso: $0 --repo ORG/REPO [--role-name NAME] [--region REGION]"
      exit 0
      ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done

if [ -z "${GITHUB_REPO}" ]; then
  echo "ERROR: pasá --repo ORG/ResponseLens-AI" >&2
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "Error: AWS CLI no instalado." >&2
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "==> Cuenta AWS: ${ACCOUNT_ID}"
echo "==> Repositorio GitHub: ${GITHUB_REPO}"

if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_ARN}" >/dev/null 2>&1; then
  echo "==> OIDC provider ya existe: ${OIDC_ARN}"
else
  echo "==> Creando OIDC provider de GitHub Actions..."
  aws iam create-open-id-connect-provider \
    --url "${OIDC_URL}" \
    --client-id-list "${OIDC_AUDIENCE}" \
    --thumbprint-list "${GITHUB_OIDC_THUMBPRINT}" \
    --tags Key=Project,Value=responselens Key=ManagedBy,Value=setup-github-oidc
fi

TRUST_FILE="$(mktemp)"
cat > "${TRUST_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${OIDC_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "${OIDC_AUDIENCE}"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo "==> Actualizando trust policy del rol ${ROLE_NAME}"
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "file://${TRUST_FILE}"
else
  echo "==> Creando rol ${ROLE_NAME}"
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "file://${TRUST_FILE}" \
    --tags Key=Project,Value=responselens Key=ManagedBy,Value=setup-github-oidc \
    --description "GitHub Actions deploy role for ResponseLens AI"
fi
rm -f "${TRUST_FILE}"

POLICY_FILE="$(mktemp)"
cat > "${POLICY_FILE}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LambdaDeploy",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "lambda:PublishVersion"
      ],
      "Resource": "arn:aws:lambda:${AWS_REGION}:${ACCOUNT_ID}:function:responselens-*"
    },
    {
      "Sid": "LambdaWait",
      "Effect": "Allow",
      "Action": ["lambda:GetFunction", "lambda:GetFunctionConfiguration"],
      "Resource": "*"
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name responselens-github-deploy-inline \
  --policy-document "file://${POLICY_FILE}"
rm -f "${POLICY_FILE}"

echo ""
echo "==> Listo. Añadí este secret en GitHub:"
echo "    AWS_DEPLOY_ROLE_ARN=${ROLE_ARN}"
echo "==> Variable recomendada: AWS_REGION=${AWS_REGION}"
echo "==> Variable recomendada: NAME_PREFIX=responselens-dev"
