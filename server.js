const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const Pusher = require("pusher");

// Route files
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emailRoutes');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Pusher setup
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "1993310",
  key: process.env.PUSHER_KEY || "bc484970cb551cc676b8",
  secret: process.env.PUSHER_SECRET || "da4c3963a61ee7ccdded",
  cluster: process.env.PUSHER_CLUSTER || "ap1",
  useTLS: true
});

// PostgreSQL setup
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DB || 'data_compass',
  password: process.env.PG_PASS || '12345',
  port: process.env.PG_PORT || 5432,
});

// In-memory cache
let rawDataCache = [];

// Util: Validasi dan parsing data sensor
function parseAndValidate(rawData) {
  try {
    const sensor = JSON.parse(rawData.data);
    const radioObj = JSON.parse(rawData.radio);
    const timestampMs = Math.floor(radioObj.time * 1000);
    if (isNaN(timestampMs)) return null;

    if (
      typeof sensor.T !== 'number' ||
      typeof sensor.RH !== 'number' ||
      typeof sensor.GM !== 'number' ||
      typeof sensor.CO2 !== 'number' ||
      typeof sensor.Vol !== 'number' ||
      typeof sensor.Tm !== 'number'
    ) return null;

    return {
      temperature: sensor.T,
      humidity: sensor.RH,
      gm: sensor.GM,
      co2: sensor.CO2,
      vol: sensor.Vol,
      tm: sensor.Tm,
      timestamp: new Date(timestampMs)
    };
  } catch (e) {
    console.error('Parsing error:', e);
    return null;
  }
}

// MQTT setup
const mqttClient = mqtt.connect('tcp://mqtt.telkomiot.id:1883', {
  clientId: 'compass-subscriber-nodejs',
  username: process.env.MQTT_USER || '196f5e3dd76a3b6f',
  password: process.env.MQTT_PASS || '196f5e3dd78d2611'
});

const mqttTopic = process.env.MQTT_TOPIC || 'v2.0/subs/APP682463a4825ed63550/DEV68254873228f299787';

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttClient.subscribe(mqttTopic, (err) => {
    if (err) console.error('Subscribe error:', err);
    else console.log(`Subscribed to topic: ${mqttTopic}`);
  });
});

mqttClient.on('message', async (topic, message) => {
  console.log(`MQTT message received: ${message.toString()}`);
  const rawPayload = JSON.parse(message.toString());

  rawDataCache.unshift(rawPayload);
  if (rawDataCache.length > 100) rawDataCache.pop();

  const filteredData = parseAndValidate(rawPayload);
  if (!filteredData) {
    console.warn('Invalid sensor data');
    return;
  }

  try {
    await pool.query(
      `INSERT INTO sensor_data (temperature, humidity, gm, co2, vol, tm, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        filteredData.temperature,
        filteredData.humidity,
        filteredData.gm,
        filteredData.co2,
        filteredData.vol,
        filteredData.tm,
        filteredData.timestamp
      ]
    );

    pusher.trigger('sensor-channel', 'new-data', filteredData);
  } catch (err) {
    console.error('❌ Error saving to DB:', err);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);

// API untuk data sensor
app.get('/raw', (req, res) => {
  res.json(rawDataCache);
});

app.get('/raw/filtered', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT temperature, humidity, gm, co2, vol, tm, timestamp
       FROM sensor_data ORDER BY timestamp DESC LIMIT 15`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Failed to fetch filtered data');
  }
});

app.post('/mqtt/raw', async (req, res) => {
  const rawData = req.body;
  rawDataCache.unshift(rawData);
  if (rawDataCache.length > 100) rawDataCache.pop();

  const filteredData = parseAndValidate(rawData);
  if (!filteredData) return res.status(400).send('Invalid sensor data');

  try {
    await pool.query(
      `INSERT INTO sensor_data (temperature, humidity, gm, co2, vol, tm, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        filteredData.temperature,
        filteredData.humidity,
        filteredData.gm,
        filteredData.co2,
        filteredData.vol,
        filteredData.tm,
        filteredData.timestamp
      ]
    );

    pusher.trigger('sensor-channel', 'new-data', filteredData);
    res.status(200).send('Data saved successfully');
  } catch (error) {
    console.error('Error saving HTTP data:', error);
    res.status(500).send('Failed to save filtered data');
  }
});

// Root
app.get('/', (req, res) => {
  res.send('Server berjalan dengan baik');
});

// Start server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
