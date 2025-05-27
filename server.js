const express = require('express');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const Pusher = require("pusher");
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/emailRoutes'); // Tambahkan route email

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // Built-in body parser

// Setup pusher
const pusher = new Pusher({
  appId: "1993310",
  key: "bc484970cb551cc676b8",
  secret: "da4c3963a61ee7ccdded",
  cluster: "ap1",
  useTLS: true
});

// Setup koneksi PostgreSQL untuk data filter
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'data_compass',
  password: '12345',
  port: 5432,
});

// Cache memory untuk data raw
let rawDataCache = [];

// Fungsi validasi dan parsing data sensor dari data.raw JSON string
function parseAndValidate(rawData) {
  try {
    // Parse sensor data
    const sensor = JSON.parse(rawData.data);
    
    // Parse radio data (string JSON) jadi objek
    const radioObj = JSON.parse(rawData.radio);

    // Konversi waktu dari detik ke milidetik dan cek valid
    const timestampMs = Math.floor(radioObj.time * 1000);
    if (isNaN(timestampMs)) {
      return null;
    }
    const timestamp = new Date(timestampMs);

    // Validasi tipe data sensor
    if (
      typeof sensor.T !== 'number' ||
      typeof sensor.RH !== 'number' ||
      typeof sensor.GM !== 'number' ||
      typeof sensor.CO2 !== 'number' ||
      typeof sensor.Vol !== 'number' ||
      typeof sensor.Tm !== 'number'
    ) {
      return null; // invalid sensor data
    }

    return {
      temperature: sensor.T,
      humidity: sensor.RH,
      gm: sensor.GM,
      co2: sensor.CO2,
      vol: sensor.Vol,
      tm: sensor.Tm,
      timestamp: timestamp
    };
  } catch (e) {
    console.error('Parsing error:', e);
    return null; // parsing error
  }
}

// -----------------------------------
// Setup MQTT subscribe
// -----------------------------------

const mqttBrokerUrl = 'tcp://mqtt.telkomiot.id:1883';
const mqttOptions = {
  clientId: 'compass-subscriber-nodejs',
  username: '196f5e3dd76a3b6f',  // ganti sesuai Access Key
  password: '196f5e3dd78d2611',  // ganti sesuai Access Token
};

const mqttTopic = 'v2.0/subs/APP682463a4825ed63550/DEV68254873228f299787';

const mqttClient = mqtt.connect(mqttBrokerUrl, mqttOptions);

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttClient.subscribe(mqttTopic, (err) => {
    if (err) {
      console.error('Subscribe error:', err);
    } else {
      console.log(`Subscribed to topic: ${mqttTopic}`);
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  console.log(`MQTT message received on topic ${topic}: ${message.toString()}`);

  try {
    // Parse payload JSON dari string MQTT message
    const rawPayload = JSON.parse(message.toString());

    // Simpan ke cache
    rawDataCache.unshift(rawPayload);
    if (rawDataCache.length > 100) rawDataCache.pop();

    // Parsing dan validasi data sensor
    const filteredData = parseAndValidate(rawPayload);

    if (!filteredData) {
      console.warn('Invalid sensor data, skipped saving to DB');
      return; // skip simpan DB
    }

    // Simpan ke database
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
        filteredData.timestamp,
      ]
    );
    console.log('Filtered data saved:', filteredData);

  pusher.trigger('sensor-channel', 'new-data', filteredData);
  } catch (error) {
    console.error('❌ Error processing MQTT message:', error);
  }
});

// -----------------------------------
// Endpoint HTTP untuk MQTT
// -----------------------------------

// Tampilkan data raw dari cache
app.get('/raw', (req, res) => {
  res.json(rawDataCache);
});

// Tampilkan data filter dari DB
app.get('/raw/filtered', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT temperature, humidity, gm, co2, vol, tm, timestamp
       FROM sensor_data ORDER BY timestamp DESC LIMIT 15`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching filtered data:', error);
    res.status(500).send('Failed to fetch filtered data');
  }
});

// Endpoint POST /mqtt/raw tetap ada (optional) kalau kamu mau masih bisa nerima data via HTTP juga
app.post('/mqtt/raw', async (req, res) => {
  const rawData = req.body;
  console.log('Received raw data:', rawData);

  // Simpan ke cache
  rawDataCache.unshift(rawData);
  if (rawDataCache.length > 100) rawDataCache.pop();

  // Parse & filter data sensor
  const filteredData = parseAndValidate(rawData);

  if (!filteredData) {
    console.warn('Invalid sensor data, skipped saving to DB');
    return res.status(400).send('Invalid sensor data');
  }

  // Simpan hasil filter ke DB
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
    console.log('Filtered data saved:', filteredData);

     pusher.trigger('sensor-channel', 'new-data', filteredData);

    res.status(200).send('Raw data cached and filtered data saved');
  } catch (error) {
    console.error('❌ Failed to save HTTP filtered data:', error);
    res.status(500).send('Failed to save filtered data');
  }
});

// -----------------------------------
// Endpoint HTTP untuk auth
// -----------------------------------

app.use('/api', emailRoutes);
// Routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes); // Gunakan prefix '/api/email' agar lebih spesifik

// Root endpoint
app.get('/', (req, res) => {
  res.send('Server berjalan dengan baik');
});

// Start server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});