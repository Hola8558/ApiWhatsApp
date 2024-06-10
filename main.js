const express = require('express');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

// Middleware
app.use(cors({
  origin: '*', // Permitir todos los orígenes
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204
}));


app.use(express.json());
app.use('/api', router);
app.use('/uploads', express.static('uploads'));

let client = null;
let qrCallback = null;
let isInitializing = false;

const upload = multer({ storage: storage });

const initializeClient = async (res = null) => {
  if (isInitializing) return;
  isInitializing = true;

  if (client) {
    try {
      await client.destroy();
    } catch (e) {
      console.error('Error destroying client:', e);
    }
    client = null;
  }

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 60000  // Aumenta el tiempo de espera a 60 segundos
    },
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
  });

  client.on('qr', qr => {
    if (qrCallback) {
      qrCallback(qr);
    }
  });

  client.on('ready', () => {
    console.log('Client is ready!');
    qrCallback = null;
    if (res && !res.headersSent) {
      res.status(200).send({ success: true, message: 'Session is ready.' });
    }
    isInitializing = false;
  });

  client.on('authenticated', () => {
    console.log('Authenticated');
  });

  client.on('auth_failure', msg => {
    console.error('Authentication failed:', msg);
    isInitializing = false;
    if (res && !res.headersSent) {
      res.status(500).send({ success: false, error: 'Authentication failed.' });
    }
  });

  client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);
    client.destroy();
    client = null;
    isInitializing = false;
  });

  try {
    await client.initialize();
  } catch (e) {
    console.error('Error initializing client:', e);
    isInitializing = false;
    if (res && !res.headersSent) {
      res.status(500).send({ success: false, error: 'Initialization failed.' });
    }
  }
};

initializeClient()

// Ruta para generar el QR
router.get('/qr', async (req, res) => {
  if (client && client.info) {
    return res.status(200).send({ success: true, message: 'Ya existe una secion iniciada.' });
  }

  initializeClient(res);

  let timeout;
  try {
    console.log('Intentando Qr');
    client.on('qr', async qr => {
      clearTimeout(timeout);
      try {
        const url = await qrcode.toDataURL(qr);
        if (!res.headersSent) {
          console.log(url);
          res.status(200).send({ success: true, message: 'QR code generated.', qr: url });
        }
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).send({ success: false, error: err.message });
        }
      }
    });

    timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).send({ success: false, message: 'QR code scan timeout. Please try again.' });
      }
    }, 60000); // Timeout after 60 seconds

  } catch (err) {
    qrCallback = null;  // Reset the callback on error
    if (!res.headersSent) {
      res.status(500).send({ success: false, error: err.message });
    }
  }
});

// Ruta para enviar mensajes
router.post('/message', upload.single('file'), async (req, res) => {
  const { message, number } = req.body;
  const file = req.file;

  if (!client || !client.info) {
    console.log('Nosecion')
    return res.status(400).send({ success: false, message: 'No existe secion activa.' });
}

  if (!message && !file) {
    return res.status(400).send({ error: 'Message body or file is required' });
  }

  const recipient = `521${number}@c.us`;

  try {
    let response;
    if (file) {
      const media = MessageMedia.fromFilePath(file.path);
      response = await client.sendMessage(recipient, media, { caption: message });
      // Eliminar el archivo después de enviarlo
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`Error deleting file ${file.path}:`, err);
        } else {
          console.log(`File ${file.path} deleted successfully.`);
        }
      });
    } else {
      response = await client.sendMessage(recipient, message);
    }
    res.status(200).send({ success: true, response });
  } catch (err) {
    console.error('Message sending error', err);
    res.status(500).send({ success: false, error: err.message });
  }
});

app.listen(8000, () => {
  console.log("Server live on Port 8000!");
});