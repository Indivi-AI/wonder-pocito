# Wonder Helm deployment

The same chart deploys tagged local images to Kubernetes and digest-pinned release images to OpenShift. Applet code chooses its model at runtime;
the chart only mounts the LiteLLM model catalog.

```sh
helm lint . -f values-local.yaml --set images.wonder=x --set images.marketplace=x --set images.litellm=x --set images.minio=x --set llm.config=x
helm template wonder . -f values-local.yaml --set images.wonder=x --set images.marketplace=x --set images.litellm=x --set images.minio=x --set llm.config=x
```

For OpenShift, copy `values-openshift.example.yaml`, replace every image with its internal-registry digest, create `wonder-secrets`
(S3 credentials only — the LLM api keys live inside `llm-lite-config.yaml`), and run:

```sh
helm upgrade --install wonder . -n wonder --create-namespace -f values-openshift.yaml --set-file llm.config=../../llm-lite-config.yaml --wait --timeout 10m
```
