# See http://strongloop.github.io/node-foreman/ for documentation

database: scripts/start-database.sh
api: cd dist/components/api-server && bin/server --http-port=$PORT
previews: cd dist/components/previews-server && npm start
proxy: node scripts/compile-proxy-config proxy/vars.development.js && nginx -c "`pwd`/proxy/nginx.conf"
