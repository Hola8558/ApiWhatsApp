//const functions = require('firebase-functions')
const express = require('express');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const rimraf = require('rimraf');
const path = require('path');

require('dotenv').config()

const app = express();
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '/.wwebjs_auth/uploads');
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
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

app.use(express.json());
app.use('/api', router);
app.use('/uploads', express.static('uploads'));

const clientsIds = [];
const clients = new Map(); // Store multiple client instances
const qrCallbacks = new Map(); // Store QR callbacks for each client
const upload = multer({ storage: storage });

const initializeClient = async (sessionId, res = null) => {
  console.log(clients);
  if (clients.has(sessionId)) {
    const existingData = clients.get(sessionId);
    if (existingData.client && existingData.client.isReady) {
      return;
    }
  }

  clients.set(sessionId, { isInitializing: true });
  let client = clients.get(sessionId).client;

  if (!client)
  client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 60000
    },
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
  });

  client.on('qr', qr => {
    const callback = qrCallbacks.get(sessionId);
    if (callback) {
      callback(qr);
    }
  });

  client.on('ready', () => {
    console.log(`Client ${sessionId} is ready!`);
    qrCallbacks.delete(sessionId);
    clients.set(sessionId, { client, isInitializing: false });
    if (res && !res.headersSent) {
      res.status(200).send({ success: true, message: 'Session is ready.' });
    }
  });
  client.on('authenticated', () => {
    console.log(`Client ${sessionId} authenticated`);
    clientsIds.push(sessionId)
  });
  
  client.on('auth_failure', msg => {
    console.error(`Authentication failed for ${sessionId}:`, msg);
    clients.delete(sessionId);
    if (res && !res.headersSent) {
      res.status(500).send({ success: false, error: 'Authentication failed.' });
    }
  });

  client.on('disconnected', async (reason) => {
    console.log(`Client ${sessionId} disconnected:`, reason);
    client.destroy();
    clients.delete(sessionId);
    setTimeout(() => {
      deleteDirectory(`./.wwebjs_auth/session-${sessionId}`);
  }, 1000);
  });

  try {
    await client.initialize();
  } catch (e) {
    console.error(`Error initializing client ${sessionId}:`, e);
    clients.delete(sessionId);
    if (res && !res.headersSent) {
      res.status(500).send({ success: false, error: 'Initialization failed.' });
    }
  }
};

async function deleteDirectory(directory) {
  try {
      await new Promise((resolve, reject) => {
          rimraf(directory, (err) => {
              if (err) return reject(err);
              resolve();
          });
      });
      console.log('Session Removed');
  } catch (err) {
      console.error('Something wrong happened removing the session', err);
  }
}

router.get('/qr/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  if (clients.has(sessionId) && clients.get(sessionId).client && clients.get(sessionId).client.info) {
    return res.status(200).send({ success: true, message: 'Ya existe una sesión iniciada.' });
  }

  initializeClient(sessionId, res);

  try {
    qrCallbacks.set(sessionId, async qr => {
      try {
        const url = await qrcode.toDataURL(qr);
        if (!res.headersSent) {
          res.status(200).send({ success: true, message: 'QR code generated.', qr: url });
        }
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).send({ success: false, error: err.message });
        }
      }
    });

    setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).send({ success: false, message: 'QR code scan timeout. Please try again.' });
      }
    }, 60000); // Timeout after 60 seconds

  } catch (err) {
    qrCallbacks.delete(sessionId);
    if (!res.headersSent) {
      res.status(500).send({ success: false, error: err.message });
    }
  }
});

router.get('/login/:sessionId' , async (req, res) => {
  const { sessionId }  = req.params;
  console.log(`To Loggin ${sessionId}`);
  for (let i = 0; i < clientsIds.length; i++){
    if (clientsIds[i] === sessionId)
      return res.status(200).send({success:true, message: 'Concexión con wsp exitosa.'});
  }

  initializeClient(sessionId, res);
})

router.post('/messageTest', async (req, res) => {
  const text = {
    nombre: 'test',
    prop: 'Probar disco'
  };
  try{
    const folderPath = './.wwebjs_auth';
    const fileName = 'prueba.json';
    const filePath = path.join(folderPath, fileName);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  
    // Escribir el archivo JSON
    fs.writeFileSync(filePath, JSON.stringify(text), 'utf8', (err) => {
      if (err) {
        console.error('Error writing file:', err);
        throw err;
      }
      console.log('JSON file has been saved.');
    });
    return res.status(200).send({msg:'Exito guardadno'})
  } catch (e){
    return res.status(208).send({err:e})
  }

})
const fsSync = require('fs');
router.get('/messageTest', async (req, res) => {
  try {
      const folderPath = './.wwebjs_auth';
      const fileName = 'prueba.json';
      const filePath = path.join(folderPath, fileName);

      if (!fsSync.existsSync('./.wwebjs_auth/prueba.json')) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      
      // Leer el archivo JSON
      const jsonString = fs.readdirSync('./.wwebjs_auth').filter(file => path.extname(file) === '.json');
      const fileData = fs.readFileSync(path.join('./.wwebjs_auth', jsonString[0]));
      // Convertir la cadena JSON a un objeto
      const jsonData = JSON.parse(fileData);

      // Retornar el contenido del JSON
      return res.status(200).send(jsonData);
    } catch (e){
      return res.status(208).send({err:e})
    }
})

// Ruta para enviar mensajes
router.post('/message/:sessionId', upload.single('file'), async (req, res) => {
  const { sessionId } = req.params;
  const { message, number } = req.body;
  const file = req.file;
  const clientData = clients.get(sessionId);
  if (!clientData || !clientData.client || !clientData.client.info) {
    return res.status(400).send({ success: false, message: 'No existe sesión activa.' });
  }

  if (!message && !file) {
    return res.status(400).send({ error: 'Message body or file is required' });
  }

  const recipient = `521${number}@c.us`;

  console.log(`Sending message to: ${recipient}`);
  try {
    let response;
    if (file) {
      const media = MessageMedia.fromFilePath(file.path);
      response = await clientData.client.sendMessage(recipient, media, { caption: message });
      // Eliminar el archivo después de enviarlo
      fs.unlink(file.path, (err) => {
        if (err) {
          console.error(`Error deleting file ${file.path}:`, err);
        } else {
          console.log(`File ${file.path} deleted successfully.`);
        }
      });
    } else {
      response = await clientData.client.sendMessage(recipient, message);
    }
    //console.log('Message sent:', response);
    res.status(200).send({ success: true, response });
  } catch (err) {
    console.error('Message sending error', err);
    res.status(500).send({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server live on Port ${PORT}!`);
});
