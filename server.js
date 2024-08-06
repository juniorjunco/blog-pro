const puppeteer = require('puppeteer');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();



// Configurar Express
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS
const corsOptions = {
  origin: ['http://marionve.com', 'https://marionve.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Asegurar el manejo de solicitudes preflight
app.options('*', cors(corsOptions));


// Configuración de Multer para manejar la subida de archivos
// Configuración de Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB para archivos
});



// Middlewares
app.use(bodyParser.json({ limit: '1000mb' }));
app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));




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
    to: 'marionvectg@gmail.com', // Tu correo receptor
    from:  'juniorjunco@gmail.com',// Correo del remitente
    subject: `Nuevo formulario de contacto Marion ve ${nome}`,
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

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String }
});
const News = mongoose.model('News', newsSchema);

// Ruta para crear una noticia
app.post('/news', authenticateToken, upload.single('image'), async (req, res) => {
  console.log('Request file:', req.file);
  console.log('Request body:', req.body);

  try {
    const { title, description } = req.body;
    let imageUrl = null;

    if (req.file) {
      // Convert buffer to stream
      const bufferStream = new Readable();
      bufferStream.push(req.file.buffer);
      bufferStream.push(null); // End of stream

      // Use a promise to handle async upload
      imageUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject('Error uploading image to Cloudinary');
            }
            resolve(result.secure_url);
          }
        );
        
        bufferStream.pipe(uploadStream);
      });
    }

    const news = new News({
      title,
      description,
      image: imageUrl
    });
    await news.save();
    res.status(201).json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para actualizar una noticia
app.put('/news/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log('Request file:', req.file); // Verifica el archivo recibido
    console.log('Request body:', req.body); // Verifica los datos del formulario

    const newsId = req.params.id;
    const { title, description } = req.body;
    let imageUrl = null;

    if (req.file) {
      // Convert buffer to stream
      const bufferStream = new Readable();
      bufferStream.push(req.file.buffer);
      bufferStream.push(null); // End of stream

      // Use a promise to handle async upload
      imageUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject('Error uploading image to Cloudinary');
            }
            resolve(result.secure_url);
          }
        );
        
        bufferStream.pipe(uploadStream);
      });
    }

    const news = await News.findById(newsId);

    if (!news) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }

    news.title = title;
    news.description = description;
    if (imageUrl) {
      news.image = imageUrl;
    }
    await news.save();
    res.status(200).json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para eliminar una noticia
app.delete('/news/:id', authenticateToken, async (req, res) => {
  try {
    const newsId = req.params.id;
    const news = await News.findById(newsId);

    if (!news) {
      return res.status(404).json({ success: false, message: 'Noticia no encontrada' });
    }

    await News.findByIdAndDelete(newsId);
    res.status(200).json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para obtener todas las noticias
app.get('/news', async (req, res) => {
  try {
    const news = await News.find(); // Obtiene todas las noticias de la base de datos
    res.json(news); // Envía las noticias en formato JSON
  } catch (error) {
    console.error('Error retrieving news:', error);
    res.status(500).send('Error retrieving news');
  }
});

// Ruta para editar una noticia
app.put('/news/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    console.log('Request file:', req.file);
    console.log('Request body:', req.body);

    const newsId = req.params.id;
    const { title, description } = req.body;
    let imageUrl = null;

    if (req.file) {
      const bufferStream = new Readable();
      bufferStream.push(req.file.buffer);
      bufferStream.push(null);

      imageUrl = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: 'auto' },
          (error, result) => {
            if (error) {
              console.error('Cloudinary upload error:', error);
              reject('Error uploading image to Cloudinary');
            }
            resolve(result.secure_url);
          }
        );
        
        bufferStream.pipe(uploadStream);
      });
    }

    const news = await News.findById(newsId);

    if (!news) {
      return res.status(404).send({ success: false, message: 'Noticia no encontrada' });
    }

    news.title = title;
    news.description = description;
    if (imageUrl) {
      news.image = imageUrl;
    }
    await news.save();
    res.status(200).send({ success: true, message: 'Noticia actualizada exitosamente' });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// Ruta para eliminar una noticia
app.delete('/news/:id', authenticateToken, async (req, res) => {
  try {
    const newsId = req.params.id;
    const news = await News.findById(newsId);

    if (!news) {
      return res.status(404).send({ success: false, message: 'Noticia no encontrada' });
    }

    await News.findByIdAndDelete(newsId);
    res.status(200).send({ success: true, message: 'Noticia eliminada exitosamente' });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


