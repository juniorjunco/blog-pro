const puppeteer = require('puppeteer');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();



// Configurar Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS
app.use(cors({
  origin: 'https://marionve.netlify.app',
  methods: ['GET', 'POST'],  // Agrega los métodos HTTP permitidos
  allowedHeaders: ['Content-Type', 'Authorization']  // Agrega los encabezados permitidos
}));

// Configuración de Multer para manejar la subida de archivos
const storage = multer.memoryStorage(); // Usar memoria en lugar de disco
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 } // Aumenta el límite según tus necesidades (10MB en este caso)
});

// Middlewares
app.use(bodyParser.json({ limit: '20mb' })); // Aumenta el límite de tamaño a 20MB
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

// Conectar a MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Conectado a MongoDB');
}).catch((err) => {
  console.error('Error al conectar a MongoDB:', err.message);
});

// Definir esquema de usuario
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Middleware para verificar el token JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Rutas de autenticación
app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send('Username and password are required');
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).send('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword
    });
    await user.save();
    res.status(201).send('User created successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).send('Username and password are required');
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).send('User not found');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).send('Invalid password');
    }

    const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(200).send({ token });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Definir esquema de post
const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 }
});
const Post = mongoose.model('Post', postSchema);

// Ruta para crear un post
app.post('/posts', authenticateToken, async (req, res) => {
  try {
    const { title, content } = req.body;
    const post = new Post({
      title,
      content,
      user: req.user.userId
    });
    await post.save();
    res.status(201).send('Post created successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Ruta para obtener todos los posts
app.get('/posts', async (req, res) => {
  try {
    const posts = await Post.find().populate('user', 'username');
    res.json(posts); // Enviar los posts como respuesta JSON
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Ruta para eliminar un post
app.delete('/posts/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    if (post.user.toString() !== req.user.userId) {
      return res.status(403).send('Unauthorized action');
    }

    await Post.findByIdAndDelete(postId);
    res.status(200).send('Post deleted successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Ruta para editar un post
app.put('/posts/:id', authenticateToken, async (req, res) => {
  try {
    const postId = req.params.id;
    const { title, content } = req.body;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    if (post.user.toString() !== req.user.userId) {
      return res.status(403).send('Unauthorized action');
    }

    post.title = title;
    post.content = content;
    await post.save();
    res.status(200).send('Post updated successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Ruta para dar like a un post
app.post('/posts/:id/like', async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    post.likes = (post.likes || 0) + 1;
    await post.save();
    res.status(200).send('Like added successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Ruta para dar dislike a un post
app.post('/posts/:id/dislike', async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send('Post not found');
    }

    post.dislikes = (post.dislikes || 0) + 1;
    await post.save();
    res.status(200).send('Dislike added successfully');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Ruta para capturar una captura de pantalla de una URL
app.get('/screenshot/:url', async (req, res) => {
  const url = req.params.url;
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' }); // Espera hasta que la red esté tranquila
  const screenshot = await page.screenshot({ fullPage: true }); // Captura de pantalla
  await browser.close();

  // Envía la imagen como respuesta
  res.setHeader('Content-Type', 'image/png');
  res.send(screenshot);
});

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.post('/send-email', upload.array('images'), async (req, res) => {
  const { nome, email, telefone, claridadFormato, flowIdea, fechaEntrega } = req.body;

  // Preparar los archivos adjuntos
  const attachments = req.files.map(file => ({
    content: file.buffer.toString('base64'),
    filename: file.originalname,
    type: file.mimetype,
    disposition: 'attachment'
  }));

  const msg = {
    to: 'marionvectg1@gmail.com', // Tu correo receptor
    from: email, // Correo del remitente
    subject: `Nuevo formulario de contacto de ${nome}`,
    text: `
      Nombre: ${nome}
      Email: ${email}
      Teléfono: ${telefone}
      Claridad del Formato: ${claridadFormato}
      Idea: ${flowIdea}
      Fecha de Entrega: ${fechaEntrega}
    `,
    attachments: attachments
  };

  try {
    await sgMail.send(msg);
    res.status(200).send('Correo enviado con éxito');
  } catch (error) {
    console.error('Error al enviar el correo:', error);
    res.status(500).send('Error al enviar el correo');
  }
});



  
// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
