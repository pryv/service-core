SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
export PRYV_CONF_ROOT=$SCRIPT_FOLDER

# Create tests default directories
mkdir -p ${PRYV_CONF_ROOT}/pryv/mongodb/backup
mkdir -p ${PRYV_CONF_ROOT}/pryv/mongodb/log
mkdir -p ${PRYV_CONF_ROOT}/pryv/mongodb/data
mkdir -p ${PRYV_CONF_ROOT}/pryv/core/log
mkdir -p ${PRYV_CONF_ROOT}/pryv/core/data

HOSTNAME=l.rec.la docker-compose -f ${PRYV_CONF_ROOT}/pryv.yml up