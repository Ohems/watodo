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

router.use(express.static('public/build'));
router.use(express.static('public/files'));
router.use(express.static('public/favicons'));
router.use('/images', express.static('public/images'));

router.use(express.static('node_modules/react-big-calendar/lib/css'));
router.use(express.static('node_modules/react-select/dist/react-select.css'));

router.get('/', (req, res) => {
  res.redirect('home');
});

router.get('*', (req, res) => {
  res.sendFile(indexPath);
});

export default router;
