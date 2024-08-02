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
const corsOptions = {
  origin: ['http://marionve.com', 'https://marionve.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Asegurar el manejo de solicitudes preflight
app.options('*', cors(corsOptions));


// Configuración de Multer para manejar la subida de archivos
const storage = multer.memoryStorage(); // Usar memoria para almacenar las imágenes temporalmente
const upload = multer({
  storage,
  limits: { fileSize: 1000 * 1024 * 1024 } // 1000MB (1GB)
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

const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true },
  description: { type: String, required: true },
  image: { data: Buffer, contentType: String } // Datos binarios de la imagen
});
const News = mongoose.model('News', newsSchema);


// Ruta para crear una noticia con imagen
app.post('/news', upload.single('image'), async (req, res) => {
  try {
    const { title, date, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Imagen es requerida' });
    }

    const newNews = new News({
      title,
      date,
      description,
      image: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });

    await newNews.save();
    res.status(201).json(newNews);
  } catch (error) {
    console.error('Error al crear noticia:', error);
    res.status(500).json({ message: 'Error al crear noticia', error });
  }
});

app.get('/news/image/:id', async (req, res) => {
  try {
    const news = await News.findById(req.params.id);
    if (!news || !news.image || !news.image.data) {
      return res.status(404).json({ message: 'Imagen no encontrada' });
    }
    res.set('Content-Type', news.image.contentType);
    res.send(news.image.data);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la imagen', error });
  }
});

app.get('/news', async (req, res) => {
  try {
    const news = await News.find();
    const newsWithImageUrls = news.map(item => {
      return {
        _id: item._id,
        title: item.title,
        date: item.date,
        description: item.description,
        imageUrl: `/news/image/${item._id}` // Añadir URL de la imagen
      };
    });
    res.status(200).json(newsWithImageUrls);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener noticias', error });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
