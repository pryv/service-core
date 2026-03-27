FROM node:22-bookworm

WORKDIR /app

# System deps for native modules (better-sqlite3, sharp)
RUN apt-get update && \
    apt-get install -y python3 build-essential && \
    rm -rf /var/lib/apt/lists/*

# Copy all source (workspaces need component package.json files for install)
COPY . .

# Install with workspaces (links components/* and storages into node_modules)
RUN npm install --omit=dev --omit=optional

# Clean up build deps
RUN apt-get -y --purge autoremove python3 build-essential && \
    apt-get autoremove -y && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "bin/master.js"]
