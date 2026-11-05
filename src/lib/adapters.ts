export const adapterStatus = () => ({
  ai: !!process.env.ANTHROPIC_API_KEY,
  ads: !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID && process.env.META_PAGE_ID),
  whatsapp: !!(process.env.EVOLUTION_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE),
  database: !!process.env.DATABASE_URL,
  shopify: !!process.env.SHOPIFY_WEBHOOK_SECRET,
  website: !!process.env.WEBSITE_WEBHOOK_SECRET,
});
