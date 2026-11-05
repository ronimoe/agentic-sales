import { bigint, boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const ws = () => text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" });
const idr = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);
const at = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => at("created_at").notNull().defaultNow();

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<WorkspaceSettings>().notNull(),
  createdAt: createdAt(),
}).enableRLS();

export type WorkspaceSettings = {
  whatsappCost: { marketingIdr: number; utilityIdr: number; serviceIdr: number; freeServicePerMonth: number };
  quietHours: { startHour: number; endHour: number };
  aiLabelAds: boolean;
  codAreas?: string[];
  brand?: { logoPath: string | null; primary: string; accent: string };
  voice?: { key: "akrab" | "sopan" | "semangat"; adExample: string; chatExample: string };
};

export const members = pgTable("members", {
  id: id(), workspaceId: ws(),
  name: text("name").notNull(),
  role: text("role").$type<"owner" | "approver" | "sales">().notNull(),
}).enableRLS();

export const products = pgTable("products", {
  id: id(), workspaceId: ws(),
  name: text("name").notNull(),
  category: text("category").$type<"cosmetic" | "food" | "general">().notNull().default("general"),
  description: text("description").notNull().default(""),
  sourceUrl: text("source_url"),
  priceIdr: idr("price_idr"),
  costIdr: idr("cost_idr"),
  stock: integer("stock").notNull().default(0),
  bpomNumber: text("bpom_number"),
  halalStatus: text("halal_status"),
  approvedClaims: jsonb("approved_claims").$type<string[]>().notNull().default([]),
  proof: jsonb("proof").$type<string[]>().notNull().default([]),
  alwaysSay: jsonb("always_say").$type<string[]>().notNull().default([]),
  neverSay: jsonb("never_say").$type<string[]>().notNull().default([]),
  targetCostIdr: bigint("target_cost_idr", { mode: "number" }),
  stopSpendIdr: bigint("stop_spend_idr", { mode: "number" }),
  photoPath: text("photo_path"),
  readiness: jsonb("readiness").$type<{ at: string; results: { id: string; question: string; answer: string | null; grounded: boolean }[] }>(),
  visual: jsonb("visual").$type<{ shape: "bottle" | "blender" | "shoe" | "box"; color: string }>().notNull().default({ shape: "box", color: "#2B3AA8" }),
  createdAt: createdAt(),
}, (t) => [index("products_ws").on(t.workspaceId)]).enableRLS();

export const variants = pgTable("variants", {
  id: id(), workspaceId: ws(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  stock: integer("stock").notNull().default(0),
}, (t) => [uniqueIndex("variant_name").on(t.productId, t.name)]).enableRLS();

export type KnowledgeTopic = "how_to" | "not_for" | "safety" | "material" | "spec" | "care" | "results" | "authenticity" | "value" | "compare" | "promo" | "faq" | "shipping" | "cod" | "returns" | "payment" | "warranty";
/** productId null means a store policy that applies to every product. Only confirmed rows reach the closer. */
export const knowledge = pgTable("knowledge", {
  id: id(), workspaceId: ws(),
  productId: text("product_id").references(() => products.id, { onDelete: "cascade" }),
  topic: text("topic").$type<KnowledgeTopic>().notNull(),
  question: text("question").notNull().default(""),
  answer: text("answer").notNull().default(""),
  status: text("status").$type<"draft" | "confirmed">().notNull().default("draft"),
  source: text("source").$type<"manual" | "link" | "chat" | "sample">().notNull().default("manual"),
  createdAt: createdAt(),
}, (t) => [index("knowledge_product").on(t.workspaceId, t.productId)]).enableRLS();

export type GoalKey = "eyeball" | "cold_sell" | "form" | "whatsapp_chat" | "retargeting";
export type Destination = "whatsapp" | "website" | "shopify" | "tokopedia" | "shopee" | "tiktok_shop" | "form" | "none";
export type GoalRules = {
  primaryMetric: "reach_cost" | "cost_per_sale" | "cost_per_qualified_lead" | "cost_per_chat";
  targetIdr: number;
  pauseSpendWithoutResultIdr: number;
  pauseOverTargetRatio: number;
  minWatchRate?: number;
  maxFrequency: number;
  scaleUnderTargetRatio: number;
  scaleStepPct: number;
};

export const goalTemplates = pgTable("goal_templates", {
  id: id(), workspaceId: ws(),
  key: text("key").$type<GoalKey>().notNull(),
  name: text("name").notNull(),
  briefFormat: text("brief_format").notNull(),
  rules: jsonb("rules").$type<GoalRules>().notNull(),
}, (t) => [uniqueIndex("goal_ws_key").on(t.workspaceId, t.key)]).enableRLS();

export type AngleType = "problem" | "desire" | "moment" | "proof" | "objection" | "value" | "identity";

export const angles = pgTable("angles", {
  id: id(), workspaceId: ws(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  audience: text("audience").notNull(),
  pain: text("pain").notNull(),
  promise: text("promise").notNull(),
  proof: text("proof").notNull().default(""),
  type: text("type").$type<AngleType>().notNull().default("problem"),
  hook: text("hook").notNull().default(""),
  status: text("status").$type<"idea" | "testing" | "winning" | "stopped">().notNull().default("idea"),
  source: text("source").$type<"agent" | "manual">().notNull().default("agent"),
  stopReason: text("stop_reason"),
  createdAt: createdAt(),
}).enableRLS();

export const campaignPlans = pgTable("campaign_plans", {
  id: id(), workspaceId: ws(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  status: text("status").$type<"proposed" | "approved" | "rejected">().notNull().default("proposed"),
  rationale: text("rationale").notNull().default(""),
  createdAt: createdAt(),
}).enableRLS();

export const campaigns = pgTable("campaigns", {
  id: id(), workspaceId: ws(),
  planId: text("plan_id").notNull().references(() => campaignPlans.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  goal: text("goal").$type<GoalKey>().notNull(),
  destination: text("destination").$type<Destination>().notNull(),
  name: text("name").notNull(),
  dailyBudgetIdr: idr("daily_budget_idr"),
  status: text("status").$type<"draft" | "live" | "paused">().notNull().default("draft"),
  externalId: text("external_id"),
  externalAdSetId: text("external_ad_set_id"),
  createdAt: createdAt(),
}).enableRLS();

export type CreativeCheck = { key: string; label: string; status: "pass" | "warn" | "fail" | "not_run"; detail?: string };

export const creatives = pgTable("creatives", {
  id: id(), workspaceId: ws(),
  campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  angleId: text("angle_id").notNull().references(() => angles.id, { onDelete: "cascade" }),
  concept: text("concept").notNull(),
  format: text("format").$type<"image" | "video">().notNull(),
  hook: text("hook").notNull(),
  primaryText: text("primary_text").notNull(),
  headline: text("headline").notNull(),
  cta: text("cta").notNull(),
  whatsappOpener: text("whatsapp_opener"),
  formQuestions: jsonb("form_questions").$type<string[]>(),
  assetPath: text("asset_path"),
  posterPath: text("poster_path"),
  refCode: text("ref_code").notNull(),
  compliance: jsonb("compliance").$type<{ passed: boolean; issues: string[] }>().notNull().default({ passed: true, issues: [] }),
  checks: jsonb("checks").$type<CreativeCheck[]>().notNull().default([]),
  script: text("script"),
  stampedPriceIdr: bigint("stamped_price_idr", { mode: "number" }),
  attempts: integer("attempts").notNull().default(1),
  tags: jsonb("tags").$type<Record<string, string | number | boolean>>().notNull().default({}),
  status: text("status").$type<"in_review" | "approved" | "rejected" | "live" | "paused">().notNull().default("in_review"),
  rejectReason: text("reject_reason"),
  pauseReason: text("pause_reason"),
  externalId: text("external_id"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("creative_ref").on(t.refCode)]).enableRLS();

export const adMetrics = pgTable("ad_metrics", {
  id: id(), workspaceId: ws(),
  creativeId: text("creative_id").notNull().references(() => creatives.id, { onDelete: "cascade" }),
  day: text("day").notNull(),
  simulated: boolean("simulated").notNull().default(true),
  spendIdr: idr("spend_idr"),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  videoWatches: integer("video_watches").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  chats: integer("chats").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  qualifiedLeads: integer("qualified_leads").notNull().default(0),
  frequency: real("frequency").notNull().default(1),
}, (t) => [uniqueIndex("metric_day").on(t.creativeId, t.day)]).enableRLS();

export const budgetLimits = pgTable("budget_limits", {
  id: id(), workspaceId: ws(),
  kind: text("kind").$type<"ads_monthly" | "ads_daily" | "assets_monthly" | "ai_monthly" | "whatsapp_monthly" | "product_daily">().notNull(),
  scopeId: text("scope_id"),
  amountIdr: idr("amount_idr"),
}, (t) => [uniqueIndex("limit_scope").on(t.workspaceId, t.kind, t.scopeId)]).enableRLS();

export const usageEvents = pgTable("usage_events", {
  id: id(), workspaceId: ws(),
  kind: text("kind").$type<"ads" | "assets" | "ai" | "whatsapp">().notNull(),
  costIdr: idr("cost_idr"),
  simulated: boolean("simulated").notNull().default(true),
  note: text("note"),
  createdAt: createdAt(),
}).enableRLS();

export type Rule = { id: string; text: string; enabled?: boolean; source?: "default" | "decision" | "manual"; block?: string };
export const rulebooks = pgTable("rulebooks", {
  id: id(), workspaceId: ws(),
  kind: text("kind").$type<"ads" | "whatsapp">().notNull(),
  version: integer("version").notNull(),
  active: boolean("active").notNull().default(true),
  rules: jsonb("rules").$type<Rule[]>().notNull(),
  tone: text("tone").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
}).enableRLS();

export const activity = pgTable("activity", {
  id: id(), workspaceId: ws(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  reason: text("reason").notNull().default(""),
  href: text("href"),
  createdAt: createdAt(),
}, (t) => [index("activity_ws").on(t.workspaceId, t.createdAt)]).enableRLS();

export const contacts = pgTable("contacts", {
  id: id(), workspaceId: ws(),
  phone: text("phone").notNull(),
  name: text("name").notNull().default(""),
  optInAt: at("opt_in_at"),
  optInSource: text("opt_in_source"),
  optOutAt: at("opt_out_at"),
  lastInboundAt: at("last_inbound_at"),
  freeEntryUntil: at("free_entry_until"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("contact_phone").on(t.workspaceId, t.phone)]).enableRLS();

export const conversations = pgTable("conversations", {
  id: id(), workspaceId: ws(),
  contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  creativeId: text("creative_id").references(() => creatives.id, { onDelete: "set null" }),
  source: text("source").$type<"ad_chat" | "form" | "organic">().notNull().default("organic"),
  handler: text("handler").$type<"ai" | "needs_human" | "human">().notNull().default("ai"),
  handoffReason: text("handoff_reason"),
  handoffQuestion: text("handoff_question"),
  stage: text("stage").$type<"new" | "qualifying" | "offer" | "ordered" | "lost">().notNull().default("new"),
  simulated: boolean("simulated").notNull().default(true),
  lastMessageAt: at("last_message_at").notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index("conv_ws").on(t.workspaceId, t.lastMessageAt)]).enableRLS();

export const messages = pgTable("messages", {
  id: id(), workspaceId: ws(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  sender: text("sender").$type<"customer" | "ai" | "human" | "system">().notNull(),
  body: text("body").notNull(),
  kind: text("kind").$type<"session" | "template">().notNull().default("session"),
  estimatedCostIdr: idr("estimated_cost_idr"),
  externalId: text("external_id"),
  createdAt: createdAt(),
}, (t) => [index("msg_conv").on(t.conversationId, t.createdAt), uniqueIndex("msg_ext").on(t.workspaceId, t.externalId)]).enableRLS();

export const objections = pgTable("objections", {
  id: id(), workspaceId: ws(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  createdAt: createdAt(),
}).enableRLS();

export type OrderChannel = "whatsapp" | "website" | "shopify" | "tokopedia" | "shopee" | "tiktok_shop";
export type OrderStatus = "ordered" | "confirmed" | "paid" | "shipped" | "delivered" | "returned" | "cancelled";
export const orders = pgTable("orders", {
  id: id(), workspaceId: ws(),
  channel: text("channel").$type<OrderChannel>().notNull(),
  externalId: text("external_id"),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: text("variant_id").references(() => variants.id, { onDelete: "set null" }),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  creativeId: text("creative_id").references(() => creatives.id, { onDelete: "set null" }),
  conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull().default(""),
  shippingAddress: text("shipping_address"),
  shippingCity: text("shipping_city"),
  shippingProvince: text("shipping_province"),
  quantity: integer("quantity").notNull().default(1),
  amountIdr: idr("amount_idr"),
  costIdr: idr("cost_idr"),
  feesIdr: idr("fees_idr"),
  paymentMethod: text("payment_method").$type<"cod" | "transfer" | "platform">().notNull().default("cod"),
  status: text("status").$type<OrderStatus>().notNull().default("ordered"),
  attribution: text("attribution").$type<"confirmed" | "partial" | "estimated" | "none">().notNull().default("none"),
  orderedAt: at("ordered_at").notNull().defaultNow(),
  deliveredAt: at("delivered_at"),
}, (t) => [index("orders_ws").on(t.workspaceId, t.orderedAt), uniqueIndex("order_ext").on(t.workspaceId, t.channel, t.externalId)]).enableRLS();
