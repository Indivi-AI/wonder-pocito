{{- define "wonder.labels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/name: wonder
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}

{{- define "wonder.publicUrl" -}}
{{- $root := index . 0 -}}
{{- $host := index . 1 -}}
{{- $suffix := "" -}}
{{- if $root.Values.exposure.port -}}{{- $suffix = printf ":%v" $root.Values.exposure.port -}}{{- end -}}
{{- printf "%s://%s%s" $root.Values.exposure.scheme $host $suffix -}}
{{- end }}
