# Wonder Helm deployment

The same chart deploys tagged local images to Kubernetes and digest-pinned release images to OpenShift. Applet code chooses its model at runtime;
the chart only mounts the LiteLLM model catalog.

```sh
helm lint . -f values-local.yaml --set images.wonder=x --set images.marketplace=x --set images.litellm=x --set images.minio=x
helm template wonder . -f values-local.yaml --set images.wonder=x --set images.marketplace=x --set images.litellm=x --set images.minio=x
```

For OpenShift, copy `values-openshift.example.yaml`, replace every image with its internal-registry digest, create `wonder-secrets`, and run:

```sh
helm upgrade --install wonder . -n wonder --create-namespace -f values-openshift.yaml --wait --timeout 10m
```
