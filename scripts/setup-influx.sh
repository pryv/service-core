#!/bin/bash
#curl -sL https://repos.influxdata.com/influxdb.key | apt-key add -
#./etc/lsb-release
#echo "deb https://repos.influxdata.com/${DISTRIB_ID,,} ${DISTRIB_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/influxdb.list
#echo "deb https://repos.influxdata.com/ubuntu bionic stable" | tee /etc/apt/sources.list.d/influxdb.list
#apt-get update && apt-get install influxdb

#mkdir var-pryv/influx
#cd var-pryv/influx
#wget https://dl.influxdata.com/influxdb/releases/influxdb_1.8.0_amd64.deb
#sudo dpkg -i influxdb_1.8.0_amd64.deb
#cd ..
#cd ..


wget -qO- https://repos.influxdata.com/influxdb.key | sudo apt-key add -
sudo ./etc/lsb-release
#echo "deb https://repos.influxdata.com/${DISTRIB_ID,,} ${DISTRIB_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/influxdb.list
echo "deb https://repos.influxdata.com/ubuntu bionic stable" | tee /etc/apt/sources.list.d/influxdb.list