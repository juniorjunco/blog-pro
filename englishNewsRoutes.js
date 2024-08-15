const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const { authenticateToken } = require('./middlewares');
const { Readable } = require('stream');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const englishNewsSchema = new mongoose.Schema({
  title: String,
  description: String,
  image: String,
  date: { type: Date, default: Date.now },
});

const EnglishNews = mongoose.model('EnglishNews', englishNewsSchema);

// Ruta para crear una noticia en inglés
router.post('/news-en', authenticateToken, upload.single('image'), async (req, res) => {
  try {
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
              reject('Error uploading image to Cloudinary');
            }
            resolve(result.secure_url);
          }
        );
        bufferStream.pipe(uploadStream);
      });
    }

    const news = new EnglishNews({
      title,
      description,
      image: imageUrl,
      date: new Date(),
    });
    await news.save();
    res.status(201).json({ success: true, news });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para actualizar una noticia en inglés
router.put('/news-en/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
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
              reject('Error uploading image to Cloudinary');
            }
            resolve(result.secure_url);
          }
        );
        bufferStream.pipe(uploadStream);
      });
    }

    const news = await EnglishNews.findById(newsId);

    if (!news) {
      return res.status(404).json({ success: false, message: 'News not found' });
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

// Ruta para eliminar una noticia en inglés
router.delete('/news-en/:id', authenticateToken, async (req, res) => {
  try {
    const newsId = req.params.id;
    const news = await EnglishNews.findById(newsId);

    if (!news) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    await EnglishNews.findByIdAndDelete(newsId);
    res.status(200).json({ success: true, message: 'News deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Ruta para obtener todas las noticias en inglés
router.get('/news-en', async (req, res) => {
  try {
    const news = await EnglishNews.find();
    res.json(news);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
