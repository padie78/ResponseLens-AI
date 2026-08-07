variable "name_prefix" {
  type = string
}

# Auth module stub — MVP usa API_KEY en AppSync.
# Reservado para Cognito User Pools (B2B) en siguientes iteraciones.
output "placeholder" {
  value = "${var.name_prefix}-auth-stub"
}
