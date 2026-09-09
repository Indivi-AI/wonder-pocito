# Pocito OpenShift deployment

1. **Build** on a connected machine with Docker and Helm, from the repository root:

   ```sh
   bash solutions/pocito/on-prem/prod/export-prod.sh VERSION
   ```

2. **Transfer** the entire `solutions/pocito/on-prem/prod/releases/VERSION/` directory into the air gap; open a terminal there.

3. **Import images:** run `shasum -a 256 -c SHA256SUMS`, then `docker load -i images.tar`. Tag and push all three images to the customer registry.

4. **Prepare OpenShift:** create/select project `pocito`, configure the three Route DNS names/TLS, and create any referenced Secrets.
   Ensure pods can reach external services and browsers can reach MinIO. Publish applets, lambda packages and runtime assets to MinIO.
   See [configuration keys and release status](deployment-reference.md).

5. **Configure:** make editable copies of the two templates:

   ```sh
   cp customer-configmaps.example.yaml customer-configmaps.yaml
   cp customer-values.example.yaml customer-values.yaml
   ```

   Edit `customer-configmaps.yaml`: replace example endpoints, credentials, database names, model ID and embedding dimensions.
   Edit `customer-values.yaml`: set images, Route hosts and the matching ConfigMap names; set optional Secret, CA and registry references if needed.

6. **Deploy:**

   ```sh
   oc apply -n pocito -f customer-configmaps.yaml
   helm upgrade --install pocito ./pocito-0.1.0.tgz -n pocito -f customer-values.yaml --wait --timeout 10m
   ```

7. **Verify:** run `oc get pods,svc,route -n pocito`; check Wonder `/health`, Marketplace/Agno `/readyz`, and open a published applet.

#Using mininal lines of code#
