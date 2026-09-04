# Bootstrap Garage (une seule fois après le premier démarrage)

```sh
docker compose exec garage /garage layout assign -z dc1 -c 1G <node-id>
docker compose exec garage /garage layout apply --version 1
docker compose exec garage /garage bucket create monopoly-uploads
docker compose exec garage /garage key create monopoly-app-key
docker compose exec garage /garage bucket allow --read --write monopoly-uploads --key monopoly-app-key
```

`<node-id>` s'obtient avec `docker compose exec garage /garage status`.

Reporter `GARAGE_S3_ACCESS_KEY` / `GARAGE_S3_SECRET_KEY` (sortie de `key create`) dans `.env`.
