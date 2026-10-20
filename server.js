import express from 'express';

// Local preview of the same static site that GitHub Pages serves.
const port = Number(process.env.PORT ?? 3000);

express()
  .use(express.static(new URL('./public', import.meta.url).pathname))
  .listen(port, () => console.log(`Le panier futé de Max : http://localhost:${port}`));
