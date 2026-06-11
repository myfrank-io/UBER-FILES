import { prisma } from '~/server/utils/prisma'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')

  const base = process.env.APP_BASE_URL || 'http://localhost:3000'
  const drivers = await prisma.driver.findMany({
    where: { status: 'ACTIVE' },
    select: { slug: true, updatedAt: true },
  })

  const urls = [
    `<url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...drivers.map(
      (d) =>
        `<url><loc>${base}/${d.slug}</loc><lastmod>${d.updatedAt.toISOString().split('T')[0]}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    ),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
})
