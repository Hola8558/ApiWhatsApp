const express = require('express');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

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

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/api', router);

let client = null;
let qrCallback = null;

// Función para inicializar el cliente de WhatsApp
const initializeClient = (res = null) => {
  if (client) {
    client.destroy();
    client = null;
  }

  if (qrCallback) qrCallback = null;

  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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
    qrCallback = null;  // Reset the QR callback after connection is established
    if (res && !res.headersSent) {
      res.status(200).send({ success: true, message: 'Ya existe una secion iniciada.' });
    }
  });

  client.on('authenticated', () => {
    console.log('Autenticado');
  });

  client.on('auth_failure', msg => {
    console.error('Fallo de autenticación', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('Client disconnected:', reason);
    client.destroy();
    client = null;
  });

  client.on('message_create', message => {
    //console.log(`${message.body}`);
  });

  client.initialize();
};

// Ruta para generar el QR
initializeClient();
router.get('/qr', async (req, res) => {
  initializeClient(res);

  let timeout;
  try {
    client.on('qr', async qr => {
      //console.log(qr);
      clearTimeout(timeout);
      try {
        const url = await qrcode.toDataURL(qr);
        //console.log(url);
        if (!res.headersSent) {
          res.status(200).send({ success: true, message: 'New QR code generated. Please scan it to login.', qr: url });
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

const PORT = process.env.PORT ;
app.listen(PORT, () => {
  console.log(`Server live on Port ${PORT}!`);
});
