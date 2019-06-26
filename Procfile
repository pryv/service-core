# See http://strongloop.github.io/node-foreman/ for documentation

database: scripts/start-database.sh
api: cd dist/components/api-server && bin/server --http-port=$PORT --logs-console-active=true --logs-console-level=debug
previews: cd dist/components/previews-server && npm start
metadata: cd dist/components/metadata && bin/metadata
webhooks: dist/components/webhooks/bin/server --config build/webhooks/config/webhooks.json

gnat: gnatsd
influx: influxd -config /usr/local/etc/influxdb.conf
mongo: ../mongodb-osx-x86_64-3.4.4/bin/mongod --smallfiles --dbpath ../mongodb-data
