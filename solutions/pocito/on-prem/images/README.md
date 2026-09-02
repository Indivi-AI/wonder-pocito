# Air-gapped Pocito images

The split compressed Docker archive contains both Linux AMD64 images and keeps every part below 200 MB.

```sh
sha256sum -c SHA256SUMS
cat pocito-dev-linux-amd64.tar.gz.part-* | gzip -dc | docker load
```

The images load as `pocito-dev:linux-amd64` and `pocito-dev:sudo-linux-amd64`. The sudo image uses `pocito` as both username and password.
