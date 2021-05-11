# HOWTO 

1. Mount `/var/log/pryv/audit/pryvio_core/` to `/app/audit` in pryvio_core docker container

```
 core:
    image: "eu.gcr.io/pryvio/core:1.7.0-rc10"
    container_name: pryvio_core
    networks:
      - frontend
      - backend
    volumes:
      - ${PRYV_CONF_ROOT}/pryv/core/conf/:/app/conf/:ro
      - ${PRYV_CONF_ROOT}/pryv/core/data/:/app/data/
      - ${PRYV_CONF_ROOT}/pryv/core/log/:/app/log/
      - /dev/log:/dev/log # for audit log
      - /var/log/pryv/audit/pryvio_core/:/app/audit
```
2. restart Pryvio core docker container
3. Run the following commands:
 `docker exec -ti pryvio_core /app/bin/scripts/migrations/audit1.6-1.7/run_in_container.sh`

# License
Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
Unauthorized copying of this file, via any medium is strictly prohibited
Proprietary and confidential