import express from 'express';
import path from 'path';
import RateLimit from 'express-rate-limit';

const indexPath = path.resolve('public/index.html');

const router = express.Router();

const rayShielding = new RateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000,
  delayMs: 0, // disabled
});

// Against ion cannons
router.use('/images/', rayShielding);
router.use('/bundle.js', rayShielding);

const staticFiles = [
  'public/build',
  'public/files',
  'public/favicons',
  { mount: '/images', path: 'public/images' },

  'node_modules/mdi/css',
  { mount: '/fonts', path: 'node_modules/mdi/fonts' },
];

staticFiles.forEach((file) => {
  if (typeof file === 'string') {
    router.use(express.static(file));
  } else {
    router.use(file.mount, express.static(file.path));
  }
});

router.get('/', (req, res) => {
  res.redirect('home');
});

router.get('*', (req, res) => {
  res.sendFile(indexPath);
});

export default router;
