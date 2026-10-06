// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { createWorker } = require('tesseract.js');
const twilio = require('twilio');
const cron = require('node-cron');

// ─── CONFIGURATION ───────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;
console.log(`🟢 Server.js démarré — écoute sur port ${PORT}`);

// Twilio WhatsApp (optionnel)
const clientTwilio = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_PHONE_NUMBER || null;
const ADMIN_WHATSAPP_NUMBER = process.env.MY_PHONE_NUMBER || null;

// ─── CONFIGURATION ACCOUNTPE ────────────────────────────────────────────────
const ACCOUNTPE_CONFIG = {
  baseUrl: 'https://api.accountpe.com/api/payin',
  payoutUrl: 'https://api.accountpe.com/api/payout',
  currency: 'XAF',
  tokenTTL: 25 * 60 * 1000,
  returnUrl: 'https://socialboosthorizon.com/payment-success.html'
};

// ─── CONFIGURATION DES DEVISES (Taux de conversion vers XAF) ────────────────
// Tous les soldes sont stockés en XAF dans la base de données
const CURRENCY_CONFIG = {
  CM: { currency: 'XAF', rate: 1, symbol: 'FCFA', name: 'Cameroun' },
  GA: { currency: 'XAF', rate: 1, symbol: 'FCFA', name: 'Gabon' },
  CG: { currency: 'XAF', rate: 1, symbol: 'FCFA', name: 'Congo' },
  TD: { currency: 'XAF', rate: 1, symbol: 'FCFA', name: 'Tchad' },
  CF: { currency: 'XAF', rate: 1, symbol: 'FCFA', name: 'Centrafrique' },
  GQ: { currency: 'XAF', rate: 1, symbol: 'FCFA', name: 'Guinée Équatoriale' },
  SN: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Sénégal' },
  CI: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Côte d\'Ivoire' },
  BF: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Burkina Faso' },
  ML: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Mali' },
  BJ: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Bénin' },
  TG: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Togo' },
  NE: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Niger' },
  GW: { currency: 'XOF', rate: 1, symbol: 'FCFA', name: 'Guinée-Bissau' },
  CD: { currency: 'CDF', rate: 0.22, symbol: 'FC', name: 'RD Congo' },
  GH: { currency: 'GHS', rate: 38, symbol: 'GH₵', name: 'Ghana' },
  NG: { currency: 'NGN', rate: 0.38, symbol: '₦', name: 'Nigeria' },
  KE: { currency: 'KES', rate: 4.6, symbol: 'KSh', name: 'Kenya' },
  UG: { currency: 'UGX', rate: 0.16, symbol: 'USh', name: 'Ouganda' },
  TZ: { currency: 'TZS', rate: 0.23, symbol: 'TSh', name: 'Tanzanie' },
  RW: { currency: 'RWF', rate: 0.46, symbol: 'FRw', name: 'Rwanda' },
  ZM: { currency: 'ZMW', rate: 22, symbol: 'ZK', name: 'Zambie' }
};

// Fonction pour convertir un montant vers XAF
function convertToXAF(amount, countryCode) {
  const config = CURRENCY_CONFIG[countryCode] || CURRENCY_CONFIG['CM'];
  const rate = config.rate || 1;
  const convertedAmount = Math.round(amount * rate);
  console.log(`💱 Conversion: ${amount} ${config.currency} × ${rate} = ${convertedAmount} XAF (${config.name})`);
  return convertedAmount;
}

// Fonction pour convertir XAF vers devise locale (inverse)
function convertFromXAF(amountXAF, countryCode) {
  const config = CURRENCY_CONFIG[countryCode] || CURRENCY_CONFIG['CM'];
  const rate = config.rate || 1;
  if (rate === 0) return amountXAF;
  const convertedAmount = Math.round(amountXAF / rate);
  return convertedAmount;
}

// Fonction pour formater un montant avec les deux devises (locale + XAF)
function formatDualCurrency(amountXAF, countryCode) {
  const config = CURRENCY_CONFIG[countryCode] || CURRENCY_CONFIG['CM'];
  const amountXAFFormatted = amountXAF.toLocaleString('fr-FR');
  
  // Si le pays utilise déjà XAF ou XOF (taux = 1), afficher seulement en FCFA
  if (config.rate === 1) {
    return `${amountXAFFormatted} FCFA`;
  }
  
  // Sinon, afficher dans la devise locale + équivalent XAF
  const localAmount = convertFromXAF(amountXAF, countryCode);
  const localFormatted = localAmount.toLocaleString('fr-FR');
  return `${localFormatted} ${config.symbol} (≈ ${amountXAFFormatted} XAF)`;
}

let accountPeTokenCache = {
  token: null,
  expiresAt: null,
  inFlightPromise: null
};

// ─── SYSTÈME DE THROTTLING POUR NOTIFICATIONS DE PAIEMENT ─────────────────
// Cache en mémoire pour limiter les notifications (1 par utilisateur toutes les 4 heures)
const paymentNotificationCache = new Map();
const PAYMENT_NOTIFICATION_COOLDOWN = 4 * 60 * 60 * 1000; // 4 heures en millisecondes

function canSendPaymentNotification(userId) {
  const lastSent = paymentNotificationCache.get(userId);
  if (!lastSent) return true;
  return (Date.now() - lastSent) >= PAYMENT_NOTIFICATION_COOLDOWN;
}

function recordPaymentNotification(userId) {
  paymentNotificationCache.set(userId, Date.now());
  // Nettoyer les anciennes entrées (plus de 24h) pour éviter les fuites mémoire
  for (const [key, timestamp] of paymentNotificationCache.entries()) {
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      paymentNotificationCache.delete(key);
    }
  }
}

// ─── SYSTÈME PERSISTANT POUR LES RAPPORTS AUTOMATIQUES ─────────────────────
// Stocke les dernières exécutions dans Firestore pour rattraper les rapports manqués
async function getLastReportExecution(reportType) {
  try {
    if (!getDB()) return null;
    const doc = await getDB().collection('system_config').doc('report_schedules').get();
    if (!doc.exists) return null;
    const data = doc.data();
    return data[reportType] ? data[reportType].toDate() : null;
  } catch (err) {
    console.error(`❌ Erreur lecture lastExecution ${reportType}:`, err.message);
    return null;
  }
}

async function setLastReportExecution(reportType) {
  try {
    if (!getDB()) return;
    await getDB().collection('system_config').doc('report_schedules').set({
      [reportType]: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`✅ Timestamp enregistré pour ${reportType}`);
  } catch (err) {
    console.error(`❌ Erreur écriture lastExecution ${reportType}:`, err.message);
  }
}

// Vérifier si un rapport doit être envoyé aujourd'hui
async function checkAndSendPendingReports() {
  try {
    if (!getDB()) {
      console.log('⚠️ DB non initialisée pour vérification rapports');
      return;
    }
    
    const now = new Date();
    const currentHour = now.getUTCHours() + 1; // +1 pour Africa/Porto-Novo (GMT+1)
    const dayOfWeek = now.getUTCDay(); // 0 = dimanche
    const dayOfMonth = now.getUTCDate();
    
    console.log(`📊 Vérification rapports pendants (H:${currentHour}, Jour semaine:${dayOfWeek}, Jour mois:${dayOfMonth})`);
    
    // Rapport journalier - doit être envoyé chaque jour après minuit
    const lastDaily = await getLastReportExecution('dailyReport');
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (!lastDaily || lastDaily < todayStart) {
      // Le rapport n'a pas été envoyé aujourd'hui, l'envoyer maintenant
      console.log('📊 Rapport journalier manquant - envoi en cours...');
      try {
        await sendDailyReport();
        await setLastReportExecution('dailyReport');
      } catch (err) {
        console.error('❌ Erreur envoi rapport journalier:', err.message);
      }
    }
    
    // Rapport hebdomadaire - doit être envoyé chaque dimanche
    if (dayOfWeek === 0) { // Dimanche
      const lastWeekly = await getLastReportExecution('weeklyReport');
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (!lastWeekly || lastWeekly < weekStart) {
        console.log('📊 Rapport hebdomadaire manquant - envoi en cours...');
        try {
          await sendWeeklyReport();
          await setLastReportExecution('weeklyReport');
        } catch (err) {
          console.error('❌ Erreur envoi rapport hebdomadaire:', err.message);
        }
      }
    }
    
    // Rapport mensuel - doit être envoyé le 1er de chaque mois
    if (dayOfMonth === 1) {
      const lastMonthly = await getLastReportExecution('monthlyReport');
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      if (!lastMonthly || lastMonthly < monthStart) {
        console.log('📊 Rapport mensuel manquant - envoi en cours...');
        try {
          await sendMonthlyReport();
          await setLastReportExecution('monthlyReport');
        } catch (err) {
          console.error('❌ Erreur envoi rapport mensuel:', err.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur vérification rapports pendants:', error);
  }
}

async function getAccountPeToken() {
  const now = Date.now();
  
  if (accountPeTokenCache.token && accountPeTokenCache.expiresAt > now + 120000) {
    return accountPeTokenCache.token;
  }
  
  if (accountPeTokenCache.inFlightPromise) {
    return accountPeTokenCache.inFlightPromise;
  }
  
  accountPeTokenCache.inFlightPromise = (async () => {
    try {
      const response = await fetch(`${ACCOUNTPE_CONFIG.baseUrl}/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.ACCOUNTPE_USERNAME,
          password: process.env.ACCOUNTPE_PASSWORD
        })
      });
      
      if (!response.ok) {
        throw new Error(`AccountPe auth failed: ${response.status}`);
      }
      
      const data = await response.json();
      accountPeTokenCache.token = data.token;
      accountPeTokenCache.expiresAt = now + ACCOUNTPE_CONFIG.tokenTTL;
      return data.token;
    } finally {
      accountPeTokenCache.inFlightPromise = null;
    }
  })();
  
  return accountPeTokenCache.inFlightPromise;
}

// Firebase Admin - Lazy initialization pour meilleur startup
let db = null;
let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) return;
  
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      admin.initializeApp({
        credential: admin.credential.cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
      });
    } else if (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json'))) {
      admin.initializeApp({
        credential: admin.credential.cert(require('./serviceAccountKey.json'))
      });
    } else {
      console.warn('⚠️ serviceAccountKey.json non trouvé et GOOGLE_APPLICATION_CREDENTIALS non défini. Firebase Admin initialisé par défaut.');
      admin.initializeApp();
    }
    firebaseInitialized = true;
  } catch (err) {
    console.error('Erreur initialisation Firebase Admin:', err);
    try { admin.initializeApp(); firebaseInitialized = true; } catch (e) { /* ignore */ }
  }
  
  try {
    db = admin.firestore();
  } catch (e) {
    console.warn('⚠️ Impossible d\'initialiser Firestore:', e && e.message ? e.message : e);
  }
}

function getDB() {
  if (!db) initializeFirebase();
  return db;
}

// ─── FONCTIONS UTILITAIRES REVENDEUR ─────────────────────────────────────
function calculateResellerLevel(weeklyOrders) {
  weeklyOrders = weeklyOrders || 0;
  if (weeklyOrders >= 20) return 'professional';
  if (weeklyOrders >= 10) return 'intermediate';
  if (weeklyOrders >= 7) return 'amateur';
  if (weeklyOrders >= 5) return 'beginner';
  return null;
}

function calculateDiscountRate(level) {
  switch(level) {
    case 'beginner': return 5;
    case 'amateur': return 10;
    case 'intermediate': return 15;
    case 'professional': return 20;
    default: return 0;
  }
}

// ─── ÉVALUATION AUTOMATIQUE DES REVENDEURS (CHAQUE DIMANCHE) ────────────
async function evaluateAllResellers() {
  console.log('🔄 Évaluation automatique des revendeurs - Début');
  
  try {
    if (!getDB()) {
      console.error('❌ Base de données non initialisée pour évaluation des revendeurs');
      return;
    }

    const usersSnapshot = await getDB().collection('users').where('isReseller', '==', true).get();
    
    if (usersSnapshot.empty) {
      console.log('ℹ️ Aucun revendeur à évaluer');
      return;
    }

    console.log(`📊 Évaluation de ${usersSnapshot.size} revendeur(s)`);

    const batch = getDB().batch();
    let updates = 0;
    let demotions = 0;
    let removals = 0;

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const userRef = getDB().collection('users').doc(doc.id);
      
      // Calculer les commandes de la semaine écoulée
      const ordersByDay = userData.resellerOrdersByDay || {};
      const today = new Date();
      let weeklyOrders = 0;

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        weeklyOrders += ordersByDay[dateKey] || 0;
      }

      const currentLevel = userData.resellerLevel || null;
      const newLevel = calculateResellerLevel(weeklyOrders);
      
      // Logique de descente de niveau ou retrait du statut
      let updateData = {
        resellerWeeklyOrders: weeklyOrders,
        resellerLevel: newLevel,
        discountRate: calculateDiscountRate(newLevel),
        lastResellerEvaluation: admin.firestore.FieldValue.serverTimestamp()
      };

      // Si le nouveau niveau est null et que l'utilisateur était débutant ou plus
      if (newLevel === null) {
        if (currentLevel === 'beginner') {
          // Retirer complètement le statut revendeur
          updateData.isReseller = false;
          updateData.resellerLevel = null;
          updateData.discountRate = 0;
          console.log(`🚫 Retrait du statut revendeur pour ${doc.id} (niveau: ${currentLevel}, commandes: ${weeklyOrders})`);
          removals++;
        } else if (currentLevel) {
          // Descendre d'un niveau
          const levels = ['beginner', 'amateur', 'intermediate', 'professional'];
          const currentIndex = levels.indexOf(currentLevel);
          const newDemotedLevel = currentIndex > 0 ? levels[currentIndex - 1] : 'beginner';
          updateData.resellerLevel = newDemotedLevel;
          updateData.discountRate = calculateDiscountRate(newDemotedLevel);
          console.log(`⬇️ Descente de niveau pour ${doc.id}: ${currentLevel} → ${newDemotedLevel} (commandes: ${weeklyOrders})`);
          demotions++;
        }
      } else if (currentLevel && newLevel !== currentLevel) {
        // Montée ou descente normale de niveau
        console.log(`🔄 Changement de niveau pour ${doc.id}: ${currentLevel} → ${newLevel} (commandes: ${weeklyOrders})`);
        updates++;
      }

      // Réinitialiser les compteurs pour la nouvelle semaine
      updateData.resellerOrdersByDay = {};
      updateData.resellerWeeklyOrders = 0; // Remettre à zéro pour la nouvelle semaine
      updateData.resellerWeeklyRevenue = 0; // Remettre le CA hebdomadaire à zéro
      updateData.weeklyResetAt = admin.firestore.FieldValue.serverTimestamp(); // Horodatage de réinitialisation

      batch.update(userRef, updateData);
    }

    await batch.commit();
    
    console.log(`✅ Évaluation terminée - Mises à jour: ${updates}, Descentes: ${demotions}, Retraits: ${removals}`);
    console.log(`🔄 Compteurs hebdomadaires réinitialisés pour tous les revendeurs (nouvelle semaine)`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'évaluation des revendeurs:', error);
  }
}

// Planifier l'évaluation chaque lundi à minuit (00:00) - début de nouvelle semaine
cron.schedule('0 0 * * 1', () => {
  console.log('🕐 Déclenchement de l\'évaluation hebdomadaire des revendeurs (Lundi minuit)');
  evaluateAllResellers();
}, {
  timezone: "Africa/Porto-Novo" // Timezone du Bénin/Cameroun (GMT+1)
});

console.log('⏰ Tâche automatique configurée: Évaluation des revendeurs chaque lundi à minuit');

// ─── RAPPORT HEBDOMADAIRE AUTOMATIQUE (Dimanche 11h) ───
async function sendWeeklyReport() {
  try {
    console.log('📊 Génération du rapport hebdomadaire...');
    
    // Date de début (il y a 7 jours) et fin (maintenant)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Convertir en Firestore Timestamp pour la comparaison
    const weekAgoTimestamp = admin.firestore.Timestamp.fromDate(weekAgo);
    
    // Récupérer toutes les commandes de la semaine
    const ordersSnapshot = await getDB().collection('commandes')
      .where('createdAt', '>=', weekAgoTimestamp)
      .get();
    
    console.log(`📊 Rapport hebdo: ${ordersSnapshot.docs.length} commandes trouvées depuis ${weekAgo.toISOString()}`);
    
    const orders = ordersSnapshot.docs.map(doc => doc.data());
    
    // Récupérer tous les utilisateurs pour trouver les nouveaux revendeurs
    const usersSnapshot = await getDB().collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculer les statistiques
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.finalCost || 0), 0);
    
    // Utilisateurs actifs (qui ont passé au moins une commande)
    const activeUserIds = new Set(orders.map(order => order.userId));
    const activeUsers = activeUserIds.size;
    
    // Meilleur utilisateur (celui qui a le plus dépensé)
    const userSpending = {};
    orders.forEach(order => {
      if (order.userId) {
        userSpending[order.userId] = (userSpending[order.userId] || 0) + (order.finalCost || 0);
      }
    });
    
    let bestUserId = null;
    let bestUserSpent = 0;
    for (const [userId, spent] of Object.entries(userSpending)) {
      if (spent > bestUserSpent) {
        bestUserSpent = spent;
        bestUserId = userId;
      }
    }
    
    const bestUser = bestUserId ? users.find(u => u.id === bestUserId) : null;
    const bestUserName = bestUser ? (bestUser.name || 'Utilisateur inconnu') : 'Aucun';
    
    // Nouveaux revendeurs inscrits cette semaine
    const newResellers = users.filter(user => {
      if (!user.isReseller || !user.lastResellerEvaluation) return false;
      const evalDate = user.lastResellerEvaluation.toDate ? user.lastResellerEvaluation.toDate() : new Date(user.lastResellerEvaluation);
      return evalDate >= weekAgo;
    });
    
    // Répartition par plateforme
    const platformStats = {};
    orders.forEach(order => {
      const platform = order.platform || 'Inconnu';
      platformStats[platform] = (platformStats[platform] || 0) + 1;
    });
    
    const topPlatform = Object.entries(platformStats)
      .sort((a, b) => b[1] - a[1])[0];
    
    // Commandes revendeur vs normales
    const resellerOrders = orders.filter(o => o.isResellerOrder).length;
    const normalOrders = totalOrders - resellerOrders;
    
    // Formatter le message SMS
    const message = `📊 RAPPORT HEBDOMADAIRE - Social Boost Horizon\n\n` +
      `📅 Période: ${weekAgo.toLocaleDateString('fr-FR')} - ${now.toLocaleDateString('fr-FR')}\n\n` +
      `📦 COMMANDES:\n` +
      `• Total: ${totalOrders} commande${totalOrders > 1 ? 's' : ''}\n` +
      `• Revendeur: ${resellerOrders}\n` +
      `• Normale: ${normalOrders}\n\n` +
      `💰 CHIFFRE D'AFFAIRES:\n` +
      `• Total: ${totalRevenue.toLocaleString('fr-FR')} FCFA\n` +
      `• Moyenne/commande: ${totalOrders > 0 ? Math.round(totalRevenue / totalOrders).toLocaleString('fr-FR') : 0} FCFA\n\n` +
      `👥 UTILISATEURS:\n` +
      `• Actifs: ${activeUsers}\n` +
      `• Meilleur client: ${bestUserName}\n` +
      `• Dépenses top: ${bestUserSpent.toLocaleString('fr-FR')} FCFA\n\n` +
      `🏆 REVENDEURS:\n` +
      `• Nouveaux: ${newResellers.length}\n\n` +
      `🌐 PLATEFORME POPULAIRE:\n` +
      `• ${topPlatform ? `${topPlatform[0]} (${topPlatform[1]} cmd)` : 'N/A'}\n\n` +
      `✅ Rapport généré automatiquement`;
    
    // Envoyer le SMS via WhatsApp
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const adminPhone = process.env.MY_PHONE_NUMBER; // Le numéro qui reçoit les notifications
    
    if (!accountSid || !authToken || !twilioPhone || !adminPhone) {
      console.error('❌ Informations Twilio manquantes pour le rapport');
      return;
    }
    
    const twilioClient = require('twilio')(accountSid, authToken);
    
    await twilioClient.messages.create({
      body: message,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${adminPhone}` // Envoyer au numéro admin (même que les notifications)
    });
    
    console.log('✅ Rapport hebdomadaire envoyé avec succès');
    console.log(`📊 Stats: ${totalOrders} commandes, ${totalRevenue} FCFA, ${activeUsers} utilisateurs actifs`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du rapport hebdomadaire:', error);
  }
}

// Planifier le rapport hebdomadaire chaque dimanche à 11h
cron.schedule('0 11 * * 0', () => {
  console.log('📊 Déclenchement du rapport hebdomadaire (Dimanche 11h)');
  sendWeeklyReport();
}, {
  timezone: "Africa/Porto-Novo" // Timezone du Bénin (GMT+1)
});

console.log('📊 Tâche automatique configurée: Rapport hebdomadaire chaque dimanche à 11h');

// ─── RAPPORT JOURNALIER AUTOMATIQUE (Chaque jour à 23h) ───
// Fonction utilitaire pour obtenir le début de la journée en timezone WAT (GMT+1)
// 00h00 WAT = 23h00 UTC de la veille
function getStartOfDayWAT() {
  const now = new Date();
  const watOffset = 1;
  const watNow = new Date(now.getTime() + watOffset * 60 * 60 * 1000);
  const startOfDayUTC = new Date(Date.UTC(
    watNow.getUTCFullYear(),
    watNow.getUTCMonth(),
    watNow.getUTCDate(),
    0, 0, 0, 0
  ));
  startOfDayUTC.setTime(startOfDayUTC.getTime() - watOffset * 60 * 60 * 1000);
  return startOfDayUTC;
}

function getStartOfYesterdayWAT() {
  const t = getStartOfDayWAT();
  t.setDate(t.getDate() - 1);
  return t;
}

// Lundi 00h00 WAT de la semaine courante
function getStartOfWeekWAT() {
  const watOffset = 1;
  const now = new Date();
  const watNow = new Date(now.getTime() + watOffset * 60 * 60 * 1000);
  const day = watNow.getUTCDay(); // 0=dim, 1=lun...
  const diffToMonday = (day === 0 ? 6 : day - 1);
  const mondayUTC = new Date(Date.UTC(
    watNow.getUTCFullYear(),
    watNow.getUTCMonth(),
    watNow.getUTCDate() - diffToMonday,
    0, 0, 0, 0
  ));
  mondayUTC.setTime(mondayUTC.getTime() - watOffset * 60 * 60 * 1000);
  return mondayUTC;
}

async function sendDailyReport() {
  try {
    console.log('📊 Génération du rapport journalier complet...');
    
    const now = new Date();
    const startOfDay = getStartOfDayWAT();
    const startOfDayTimestamp = admin.firestore.Timestamp.fromDate(startOfDay);
    
    console.log(`📊 Période: depuis ${startOfDay.toISOString()} (00h WAT)`);

    const [commandesSnap, autoOrdersSnap, advancedOrdersSnap] = await Promise.all([
      getDB().collection('commandes').where('createdAt', '>=', startOfDayTimestamp).get(),
      getDB().collection('autoOrders').where('createdAt', '>=', startOfDayTimestamp).get(),
      getDB().collection('advancedOrders').where('createdAt', '>=', startOfDayTimestamp).get()
    ]);

    const commandes = commandesSnap.docs.map(doc => doc.data());
    const autoOrders = autoOrdersSnap.docs.map(doc => doc.data());
    const advancedOrders = advancedOrdersSnap.docs.map(doc => doc.data());

    const exoOrders = commandes.filter(o => o.isAutoOrder);
    const manualOrders = commandes.filter(o => !o.isAutoOrder && !o.isResellerOrder);
    const resellerOrders = commandes.filter(o => o.isResellerOrder);
    const mtpOrders = autoOrders.filter(o => (o.provider || 'mtp') === 'mtp');
    const smmgenOrders = autoOrders.filter(o => o.provider === 'smmgen');

    const exoRevenue = commandes.reduce((s, o) => s + (o.finalCost || o.totalCost || 0), 0);
    const mtpRevenue = mtpOrders.reduce((s, o) => s + (o.priceXAF || 0), 0);
    const smmgenRevenue = smmgenOrders.reduce((s, o) => s + (o.priceXAF || 0), 0);
    const abRevenue = advancedOrders.reduce((s, o) => s + (o.priceXAF || 0), 0);
    const totalRevenue = exoRevenue + mtpRevenue + smmgenRevenue + abRevenue;

    const totalOrders = commandes.length + autoOrders.length + advancedOrders.length;

    const allUserIds = new Set();
    commandes.forEach(o => { if (o.userId) allUserIds.add(o.userId); });
    autoOrders.forEach(o => { if (o.userId) allUserIds.add(o.userId); });
    advancedOrders.forEach(o => { if (o.userId) allUserIds.add(o.userId); });

    const platformStats = {};
    [...commandes, ...autoOrders, ...advancedOrders].forEach(order => {
      const platform = order.platform || 'Inconnu';
      platformStats[platform] = (platformStats[platform] || 0) + 1;
    });
    const topPlatforms = Object.entries(platformStats).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const statusStats = { success: 0, inProgress: 0, pending: 0, cancelled: 0, partial: 0 };
    [...commandes, ...autoOrders, ...advancedOrders].forEach(o => {
      const s = (o.status || '').toLowerCase();
      if (s === 'succès' || s === 'terminé' || s === 'completed') statusStats.success++;
      else if (s === 'en cours' || s === 'traitement') statusStats.inProgress++;
      else if (s === 'en attente') statusStats.pending++;
      else if (s === 'annulée' || s === 'annulé' || s === 'canceled') statusStats.cancelled++;
      else if (s === 'partiel' || s === 'partial') statusStats.partial++;
    });

    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Douala' });

    let message = `📊 *RAPPORT JOURNALIER DES COMMANDES*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr}\n\n`;

    message += `📦 *TOTAL: ${totalOrders} commandes — ${totalRevenue.toLocaleString('fr-FR')} FCFA*\n\n`;

    message += `🔵 *EXOSUPPLIER (Standard)*\n`;
    message += `├─ Commandes normales: ${manualOrders.length}\n`;
    message += `├─ Commandes auto: ${exoOrders.length}\n`;
    message += `├─ Commandes revendeur: ${resellerOrders.length}\n`;
    message += `└─ Revenu: *${exoRevenue.toLocaleString('fr-FR')} FCFA*\n\n`;

    message += `🟣 *MTP (Automatique)*\n`;
    message += `├─ Commandes: ${mtpOrders.length}\n`;
    message += `└─ Revenu: *${mtpRevenue.toLocaleString('fr-FR')} FCFA*\n\n`;

    message += `🟡 *SMMGEN (Automatique)*\n`;
    message += `├─ Commandes: ${smmgenOrders.length}\n`;
    message += `└─ Revenu: *${smmgenRevenue.toLocaleString('fr-FR')} FCFA*\n\n`;

    message += `🟠 *AFRIQUEBOOST (Avancé)*\n`;
    message += `├─ Commandes: ${advancedOrders.length}\n`;
    message += `└─ Revenu: *${abRevenue.toLocaleString('fr-FR')} FCFA*\n\n`;

    message += `📈 *STATUTS*\n`;
    message += `├─ ✅ Succès: ${statusStats.success}\n`;
    message += `├─ 🔄 En cours: ${statusStats.inProgress}\n`;
    message += `├─ ⏳ En attente: ${statusStats.pending}\n`;
    message += `├─ 🟡 Partiel: ${statusStats.partial}\n`;
    message += `└─ ❌ Annulé: ${statusStats.cancelled}\n\n`;

    message += `👥 *UTILISATEURS ACTIFS: ${allUserIds.size}*\n\n`;

    if (topPlatforms.length > 0) {
      message += `🌐 *TOP PLATEFORMES*\n`;
      topPlatforms.forEach(([platform, count], i) => {
        const prefix = i === topPlatforms.length - 1 ? '└─' : '├─';
        message += `${prefix} ${platform}: ${count} cmd\n`;
      });
    }

    message += `\n✅ *Rapport généré à ${now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Douala' })}*`;

    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      console.log('⚠️ Configuration Twilio incomplète, rapport journalier non envoyé');
      console.log(message);
      return;
    }

    await clientTwilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
    });
    
    console.log('✅ Rapport journalier envoyé avec succès');
    console.log(`📊 Stats: ${totalOrders} commandes (Exo:${commandes.length} MTP:${mtpOrders.length} SMM:${smmgenOrders.length} AB:${advancedOrders.length}), ${totalRevenue} FCFA`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du rapport journalier:', error);
  }
}

cron.schedule('0 23 * * *', () => {
  console.log('📊 Déclenchement du rapport journalier des commandes (23h)');
  sendDailyReport();
}, { timezone: "Africa/Douala" });

console.log('📊 Tâche automatique configurée: Rapport journalier chaque jour à 23h');

// ─── RAPPORT MENSUEL AUTOMATIQUE (1er de chaque mois à minuit) ───
async function sendMonthlyReport() {
  try {
    console.log('📊 Génération du rapport mensuel...');
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    
    // Convertir en Firestore Timestamp pour la comparaison
    const startOfMonthTimestamp = admin.firestore.Timestamp.fromDate(startOfMonth);
    
    const ordersSnapshot = await getDB().collection('commandes')
      .where('createdAt', '>=', startOfMonthTimestamp)
      .get();
    
    console.log(`📊 Rapport mensuel: ${ordersSnapshot.docs.length} commandes trouvées depuis ${startOfMonth.toISOString()}`);
    
    const orders = ordersSnapshot.docs.map(doc => doc.data());
    const usersSnapshot = await getDB().collection('users').get();
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.finalCost || 0), 0);
    const totalBeforeDiscount = orders.reduce((sum, order) => sum + (order.normalPrice || order.finalCost || 0), 0);
    const totalDiscounts = totalBeforeDiscount - totalRevenue;
    const avgDiscountPercent = totalBeforeDiscount > 0 ? ((totalDiscounts / totalBeforeDiscount) * 100).toFixed(2) : 0;
    
    const activeUserIds = new Set(orders.map(order => order.userId));
    const normalUserIds = new Set();
    const resellerUserIds = new Set();
    
    orders.forEach(order => {
      if (order.userId) {
        if (order.isResellerOrder) {
          resellerUserIds.add(order.userId);
        } else {
          normalUserIds.add(order.userId);
        }
      }
    });
    
    const userSpending = {};
    orders.forEach(order => {
      if (order.userId) {
        userSpending[order.userId] = (userSpending[order.userId] || 0) + (order.finalCost || 0);
      }
    });
    
    let bestUserId = null;
    let bestUserSpent = 0;
    for (const [userId, spent] of Object.entries(userSpending)) {
      if (spent > bestUserSpent) {
        bestUserSpent = spent;
        bestUserId = userId;
      }
    }
    
    const bestUser = bestUserId ? users.find(u => u.id === bestUserId) : null;
    const bestUserName = bestUser ? (bestUser.name || 'Utilisateur inconnu') : 'Aucun';
    
    const newUsers = users.filter(user => {
      if (!user.createdAt) return false;
      const userCreatedAt = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
      return userCreatedAt >= startOfMonth;
    });
    
    const newResellers = users.filter(user => {
      if (!user.isReseller || !user.lastResellerEvaluation) return false;
      const evalDate = user.lastResellerEvaluation.toDate ? user.lastResellerEvaluation.toDate() : new Date(user.lastResellerEvaluation);
      return evalDate >= startOfMonth;
    });
    
    const platformStats = {};
    orders.forEach(order => {
      const platform = order.platform || 'Inconnu';
      platformStats[platform] = (platformStats[platform] || 0) + 1;
    });
    
    const platformsRanking = Object.entries(platformStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([platform, count], index) => `${index + 1}. ${platform}: ${count} cmd`)
      .join('\n');
    
    const ordersByStatus = {
      'succès': orders.filter(o => o.status === 'succès').length,
      'en cours': orders.filter(o => o.status === 'en cours').length,
      'En attente': orders.filter(o => o.status === 'En attente').length,
      'annulée': orders.filter(o => o.status === 'annulée').length
    };
    
    const resellerOrders = orders.filter(o => o.isResellerOrder).length;
    const normalOrders = totalOrders - resellerOrders;
    const speedModeOrders = orders.filter(o => o.speedMode === true).length;
    const speedModeRevenue = orders
      .filter(o => o.speedMode === true)
      .reduce((sum, o) => sum + (o.speedModeCharge || 0), 0);
    
    const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(now);
    const message = `📊 RAPPORT MENSUEL - Social Boost Horizon\n\n` +
      `📅 Période: ${monthName}\n\n` +
      `📦 COMMANDES:\n` +
      `• Total: ${totalOrders} commande${totalOrders > 1 ? 's' : ''}\n` +
      `• Revendeur: ${resellerOrders}\n` +
      `• Normale: ${normalOrders}\n` +
      `• Mode Vitesse ⚡: ${speedModeOrders}\n` +
      `• Par statut:\n` +
      `  - Succès: ${ordersByStatus['succès']}\n` +
      `  - En cours: ${ordersByStatus['en cours']}\n` +
      `  - Annulée: ${ordersByStatus['annulée']}\n\n` +
      `👥 UTILISATEURS:\n` +
      `• Actifs: ${activeUserIds.size}\n` +
      `• Utilisateurs normaux: ${normalUserIds.size}\n` +
      `• Revendeurs: ${resellerUserIds.size}\n` +
      `• Nouveaux inscrits: ${newUsers.length}\n` +
      `• Nouveaux revendeurs: ${newResellers.length}\n` +
      `• Meilleur client: ${bestUserName}\n` +
      `• Dépenses top: ${bestUserSpent.toLocaleString('fr-FR')} FCFA\n\n` +
      `💰 FINANCES:\n` +
      `• Chiffre d'affaires: ${totalRevenue.toLocaleString('fr-FR')} FCFA\n` +
      `• Prix avant réductions: ${totalBeforeDiscount.toLocaleString('fr-FR')} FCFA\n` +
      `• Réductions appliquées: ${totalDiscounts.toLocaleString('fr-FR')} FCFA (${avgDiscountPercent}%)\n` +
      `• Revenus Mode Vitesse: ${speedModeRevenue.toLocaleString('fr-FR')} FCFA\n` +
      `• Bénéfices nets: ${totalRevenue.toLocaleString('fr-FR')} FCFA\n` +
      `• Moyenne/commande: ${totalOrders > 0 ? Math.round(totalRevenue / totalOrders).toLocaleString('fr-FR') : 0} FCFA\n\n` +
      `🌐 TOP 5 PLATEFORMES:\n${platformsRanking || 'N/A'}\n\n` +
      `✅ Rapport généré automatiquement`;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const adminPhone = process.env.MY_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !twilioPhone || !adminPhone) {
      console.error('❌ Informations Twilio manquantes pour le rapport mensuel');
      return;
    }
    
    const twilioClient = require('twilio')(accountSid, authToken);
    
    await twilioClient.messages.create({
      body: message,
      from: `whatsapp:${twilioPhone}`,
      to: `whatsapp:${adminPhone}`
    });
    
    console.log('✅ Rapport mensuel envoyé avec succès');
    console.log(`📊 Stats: ${totalOrders} commandes, ${totalRevenue} FCFA, ${activeUserIds.size} utilisateurs actifs`);
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi du rapport mensuel:', error);
  }
}

cron.schedule('0 0 1 * *', () => {
  console.log('📊 Déclenchement du rapport mensuel (1er du mois à minuit)');
  sendMonthlyReport();
}, { timezone: "Africa/Porto-Novo" });

console.log('📊 Tâche automatique configurée: Rapport mensuel le 1er de chaque mois à minuit');

// ─────────────────────────────────────────────────────────────────────────────
// ─── RAPPORTS DE PAIEMENTS (RECHARGES) ───────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

// Fonction utilitaire pour récupérer les paiements sur une période
async function getPaymentsForPeriod(startDate, endDate) {
  const payments = {
    accountPe: [],
    fapshi: [],
    total: 0,
    totalCount: 0,
    byCountry: {},
    byUser: new Map()
  };

  const startMs = (startDate instanceof Date ? startDate : new Date(startDate)).getTime();
  const endMs = (endDate instanceof Date ? endDate : new Date(endDate)).getTime();

  function isInPeriod(data) {
    const ts = data.createdAt || data.date || data.validatedAt;
    if (!ts) return false;
    const dateMs = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
    return dateMs >= startMs && dateMs <= endMs;
  }

  // Récupérer les recharges AccountPe (Mobile Money) validées
  try {
    const rechargesSnapshot = await getDB().collection('recharges')
      .where('status', '==', 'validated')
      .get();

    let matchCount = 0;
    rechargesSnapshot.forEach(doc => {
      const data = doc.data();
      if (!isInPeriod(data)) return;
      matchCount++;
      
      const amount = data.amount || data.originalAmount || 0;
      const country = data.country || 'Inconnu';
      const userId = data.userId || 'unknown';
      
      payments.accountPe.push({
        amount,
        country,
        userId,
        email: data.email || '',
        username: data.username || '',
        date: data.createdAt?.toDate?.() || data.validatedAt?.toDate?.() || new Date()
      });
      
      payments.total += amount;
      payments.totalCount++;
      
      if (!payments.byCountry[country]) {
        payments.byCountry[country] = { count: 0, total: 0 };
      }
      payments.byCountry[country].count++;
      payments.byCountry[country].total += amount;
      
      if (!payments.byUser.has(userId)) {
        payments.byUser.set(userId, { count: 0, total: 0, name: data.username || data.email || userId });
      }
      const userStats = payments.byUser.get(userId);
      userStats.count++;
      userStats.total += amount;
    });
    console.log(`💳 AccountPe: ${rechargesSnapshot.size} total, ${matchCount} dans la période`);
  } catch (err) {
    console.error('Erreur récupération recharges AccountPe:', err.message);
  }

  // Récupérer les paiements Fapshi réussis
  try {
    const fapshiSnapshot = await getDB().collection('fapshiTransactions')
      .where('status', '==', 'SUCCESSFUL')
      .get();

    let matchCount = 0;
    fapshiSnapshot.forEach(doc => {
      const data = doc.data();
      if (!isInPeriod(data)) return;
      if (data.type === 'Demande de retrait' || data.type === 'Transfert') return;
      matchCount++;
      
      const amount = data.amount || 0;
      const country = data.country || 'CM';
      const userId = data.userId || 'unknown';
      
      payments.fapshi.push({
        amount,
        country,
        userId,
        date: data.createdAt?.toDate?.() || data.date?.toDate?.() || new Date()
      });
      
      payments.total += amount;
      payments.totalCount++;
      
      if (!payments.byCountry[country]) {
        payments.byCountry[country] = { count: 0, total: 0 };
      }
      payments.byCountry[country].count++;
      payments.byCountry[country].total += amount;
      
      if (!payments.byUser.has(userId)) {
        payments.byUser.set(userId, { count: 0, total: 0, name: data.username || data.email || userId });
      }
      const userStats = payments.byUser.get(userId);
      userStats.count++;
      userStats.total += amount;
    });
    console.log(`💳 Fapshi: ${fapshiSnapshot.size} total, ${matchCount} dans la période`);
  } catch (err) {
    console.error('Erreur récupération paiements Fapshi:', err.message);
  }

  return payments;
}

// ─── RAPPORT JOURNALIER DES PAIEMENTS (Chaque jour à 23h) ───
async function sendDailyPaymentReport() {
  try {
    console.log('💰 Génération du rapport journalier des paiements...');
    
    if (!getDB()) {
      console.error('❌ Base de données non initialisée');
      return;
    }
    
    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      console.log('⚠️ Configuration Twilio incomplète, rapport non envoyé');
      return;
    }

    const now = new Date();
    const startOfDay = getStartOfDayWAT();
    const endOfDay = new Date(now.getTime());

    console.log(`💰 Période paiements: ${startOfDay.toISOString()} → ${endOfDay.toISOString()}`);

    const payments = await getPaymentsForPeriod(startOfDay, endOfDay);

    const accountPeTotal = payments.accountPe.reduce((s, p) => s + p.amount, 0);
    const fapshiTotal = payments.fapshi.reduce((s, p) => s + p.amount, 0);
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Douala' });

    let message = `💰 *RAPPORT JOURNALIER DES PAIEMENTS*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 ${dateStr}\n\n`;

    message += `📊 *RÉSUMÉ GLOBAL*\n`;
    message += `├─ Total encaissé: *${payments.total.toLocaleString('fr-FR')} FCFA*\n`;
    message += `├─ Nombre de paiements: *${payments.totalCount}*\n`;
    message += `└─ Utilisateurs uniques: *${payments.byUser.size}*\n\n`;

    message += `💳 *PAR MÉTHODE DE PAIEMENT*\n`;
    message += `├─ 🟢 AccountPe: ${payments.accountPe.length} paiement(s) — *${accountPeTotal.toLocaleString('fr-FR')} FCFA*\n`;
    message += `└─ 🔵 Fapshi: ${payments.fapshi.length} paiement(s) — *${fapshiTotal.toLocaleString('fr-FR')} FCFA*\n\n`;

    if (Object.keys(payments.byCountry).length > 0) {
      message += `🌍 *PAR PAYS*\n`;
      const sortedCountries = Object.entries(payments.byCountry)
        .sort((a, b) => b[1].total - a[1].total);
      
      sortedCountries.forEach(([country, stats], index) => {
        const prefix = index === sortedCountries.length - 1 ? '└─' : '├─';
        message += `${prefix} ${country}: ${stats.count} paiement(s) — ${stats.total.toLocaleString('fr-FR')} FCFA\n`;
      });
      message += '\n';
    }

    if (payments.byUser.size > 0) {
      const topUsers = [...payments.byUser.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5);
      
      if (topUsers.length > 0) {
        message += `👥 *TOP ${topUsers.length} CONTRIBUTEURS*\n`;
        topUsers.forEach(([userId, stats], index) => {
          const prefix = index === topUsers.length - 1 ? '└─' : '├─';
          message += `${prefix} ${stats.name || userId}: ${stats.count} paiement(s) — ${stats.total.toLocaleString('fr-FR')} FCFA\n`;
        });
        message += '\n';
      }
    }

    if (payments.totalCount === 0) {
      message += `⚠️ *Aucun paiement enregistré aujourd'hui*\n\n`;
    }

    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `⏰ ${now.toLocaleTimeString('fr-FR', { timeZone: 'Africa/Douala' })} — Social Boost Horizon`;

    await clientTwilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
    });

    console.log(`✅ Rapport journalier des paiements envoyé: ${payments.totalCount} paiements, ${payments.total} FCFA`);
    
  } catch (error) {
    console.error('❌ Erreur rapport journalier paiements:', error);
  }
}

// Cron: Rapport journalier des paiements à 23h05 (5min après le rapport commandes)
cron.schedule('5 23 * * *', () => {
  console.log('💰 Déclenchement du rapport journalier des paiements (23h05)');
  sendDailyPaymentReport();
}, { timezone: "Africa/Porto-Novo" });

console.log('💰 Tâche automatique configurée: Rapport journalier paiements chaque jour à 23h');

// ─── RAPPORT HEBDOMADAIRE DES PAIEMENTS (Chaque dimanche à 10h) ───
async function sendWeeklyPaymentReport() {
  try {
    console.log('💰 Génération du rapport hebdomadaire des paiements...');
    
    if (!getDB()) {
      console.error('❌ Base de données non initialisée');
      return;
    }
    
    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      console.log('⚠️ Configuration Twilio incomplète, rapport non envoyé');
      return;
    }

    const now = new Date();
    // Début de la semaine (7 jours avant)
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startOfWeek.setHours(0, 0, 0, 0);

    const payments = await getPaymentsForPeriod(startOfWeek, now);

    // Moyenne journalière
    const dailyAverage = Math.round(payments.total / 7);

    // Construire le message
    let message = `💰 *RAPPORT HEBDOMADAIRE DES PAIEMENTS*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Semaine du ${startOfWeek.toLocaleDateString('fr-FR')} au ${now.toLocaleDateString('fr-FR')}\n\n`;

    message += `📊 *RÉSUMÉ DE LA SEMAINE*\n`;
    message += `├─ Total: *${payments.total.toLocaleString('fr-FR')} FCFA*\n`;
    message += `├─ Nombre de paiements: *${payments.totalCount}*\n`;
    message += `├─ Utilisateurs uniques: *${payments.byUser.size}*\n`;
    message += `├─ Moyenne journalière: ${dailyAverage.toLocaleString('fr-FR')} FCFA\n`;
    message += `├─ AccountPe: ${payments.accountPe.length} paiements\n`;
    message += `└─ Fapshi: ${payments.fapshi.length} paiements\n\n`;

    if (Object.keys(payments.byCountry).length > 0) {
      message += `🌍 *RÉPARTITION PAR PAYS*\n`;
      const sortedCountries = Object.entries(payments.byCountry)
        .sort((a, b) => b[1].total - a[1].total);
      
      sortedCountries.forEach(([country, stats], index) => {
        const prefix = index === sortedCountries.length - 1 ? '└─' : '├─';
        const percentage = payments.total > 0 ? Math.round((stats.total / payments.total) * 100) : 0;
        message += `${prefix} ${country}: ${stats.count} paiements (${stats.total.toLocaleString('fr-FR')} FCFA - ${percentage}%)\n`;
      });
    }

    // Top 5 contributeurs
    if (payments.byUser.size > 0) {
      message += `\n👥 *TOP 5 CONTRIBUTEURS*\n`;
      const topUsers = Array.from(payments.byUser.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5);
      
      topUsers.forEach(([userId, stats], index) => {
        const prefix = index === topUsers.length - 1 ? '└─' : '├─';
        message += `${prefix} ${userId.substring(0, 8)}...: ${stats.count} paiements (${stats.total.toLocaleString('fr-FR')} FCFA)\n`;
      });
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `⏰ Envoyé le ${now.toLocaleString('fr-FR')}\n`;
    message += `🔔 Social Boost Horizon`;

    await clientTwilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
    });

    console.log(`✅ Rapport hebdomadaire des paiements envoyé: ${payments.totalCount} paiements, ${payments.total} FCFA`);
    
  } catch (error) {
    console.error('❌ Erreur rapport hebdomadaire paiements:', error);
  }
}

// Cron: Rapport hebdomadaire des paiements le dimanche à 10h
cron.schedule('0 10 * * 0', () => {
  console.log('💰 Déclenchement du rapport hebdomadaire des paiements (Dimanche 10h)');
  sendWeeklyPaymentReport();
}, { timezone: "Africa/Porto-Novo" });

console.log('💰 Tâche automatique configurée: Rapport hebdomadaire paiements chaque dimanche à 10h');

// ─── RAPPORT MENSUEL DES PAIEMENTS (Dernier jour du mois à 23h) ───
async function sendMonthlyPaymentReport() {
  try {
    console.log('💰 Génération du rapport mensuel des paiements...');
    
    if (!getDB()) {
      console.error('❌ Base de données non initialisée');
      return;
    }
    
    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      console.log('⚠️ Configuration Twilio incomplète, rapport non envoyé');
      return;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    const payments = await getPaymentsForPeriod(startOfMonth, now);

    // Nombre de jours dans le mois
    const daysInMonth = now.getDate();
    const dailyAverage = Math.round(payments.total / daysInMonth);
    const avgPaymentAmount = payments.totalCount > 0 ? Math.round(payments.total / payments.totalCount) : 0;

    // Nom du mois
    const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    // Construire le message
    let message = `💰 *RAPPORT MENSUEL DES PAIEMENTS*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Mois de ${monthName}\n\n`;

    message += `📊 *BILAN DU MOIS*\n`;
    message += `├─ Total encaissé: *${payments.total.toLocaleString('fr-FR')} FCFA*\n`;
    message += `├─ Nombre de paiements: *${payments.totalCount}*\n`;
    message += `├─ Utilisateurs uniques: *${payments.byUser.size}*\n`;
    message += `├─ Moyenne par jour: ${dailyAverage.toLocaleString('fr-FR')} FCFA\n`;
    message += `└─ Montant moyen/paiement: ${avgPaymentAmount.toLocaleString('fr-FR')} FCFA\n\n`;

    message += `💳 *PAR MÉTHODE*\n`;
    const accountPeTotal = payments.accountPe.reduce((s, p) => s + p.amount, 0);
    const fapshiTotal = payments.fapshi.reduce((s, p) => s + p.amount, 0);
    message += `├─ AccountPe (Mobile Money): ${payments.accountPe.length} paiements (${accountPeTotal.toLocaleString('fr-FR')} FCFA)\n`;
    message += `└─ Fapshi (Cameroun): ${payments.fapshi.length} paiements (${fapshiTotal.toLocaleString('fr-FR')} FCFA)\n\n`;

    if (Object.keys(payments.byCountry).length > 0) {
      message += `🌍 *RÉPARTITION PAR PAYS*\n`;
      const sortedCountries = Object.entries(payments.byCountry)
        .sort((a, b) => b[1].total - a[1].total);
      
      sortedCountries.forEach(([country, stats], index) => {
        const prefix = index === sortedCountries.length - 1 ? '└─' : '├─';
        const percentage = payments.total > 0 ? Math.round((stats.total / payments.total) * 100) : 0;
        const avgPerUser = stats.count > 0 ? Math.round(stats.total / stats.count) : 0;
        message += `${prefix} ${country}\n`;
        message += `   ${stats.count} paiements | ${stats.total.toLocaleString('fr-FR')} FCFA (${percentage}%)\n`;
        message += `   Moy: ${avgPerUser.toLocaleString('fr-FR')} FCFA/paiement\n`;
      });
    }

    // Top 10 contributeurs du mois
    if (payments.byUser.size > 0) {
      message += `\n👥 *TOP 10 CONTRIBUTEURS DU MOIS*\n`;
      const topUsers = Array.from(payments.byUser.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10);
      
      topUsers.forEach(([userId, stats], index) => {
        const prefix = index === topUsers.length - 1 ? '└─' : '├─';
        const medal = index < 3 ? ['🥇', '🥈', '🥉'][index] : `${index + 1}.`;
        message += `${prefix} ${medal} ${userId.substring(0, 10)}...: ${stats.total.toLocaleString('fr-FR')} FCFA (${stats.count} paiements)\n`;
      });
    }

    message += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📈 Total du mois: *${payments.total.toLocaleString('fr-FR')} FCFA*\n`;
    message += `⏰ Envoyé le ${now.toLocaleString('fr-FR')}\n`;
    message += `🔔 Social Boost Horizon`;

    await clientTwilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
    });

    console.log(`✅ Rapport mensuel des paiements envoyé: ${payments.totalCount} paiements, ${payments.total} FCFA`);
    
  } catch (error) {
    console.error('❌ Erreur rapport mensuel paiements:', error);
  }
}

// Cron: Rapport mensuel des paiements le dernier jour du mois à 23h
// On utilise une logique pour vérifier si c'est le dernier jour du mois
cron.schedule('0 23 28-31 * *', () => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  // Si demain est le 1er, alors aujourd'hui est le dernier jour du mois
  if (tomorrow.getDate() === 1) {
    console.log('💰 Déclenchement du rapport mensuel des paiements (Dernier jour du mois)');
    sendMonthlyPaymentReport();
  }
}, { timezone: "Africa/Porto-Novo" });

console.log('💰 Tâche automatique configurée: Rapport mensuel paiements le dernier jour de chaque mois à 23h');

// ─── VÉRIFICATION AUTOMATIQUE DES STATUTS DE COMMANDES (TOUTES LES 5 MIN) ───
async function checkAndUpdateOrderStatuses() {
  try {
    if (!getDB()) {
      console.error('❌ Base de données non initialisée pour vérification des commandes');
      return;
    }
    
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    // Récupérer toutes les commandes en attente ou en cours
    const pendingOrders = await getDB()
      .collection('commandes')
      .where('status', 'in', ['En attente', 'en cours'])
      .get();
    
    if (pendingOrders.empty) {
      return; // Rien à faire
    }
    
    let updatedToInProgress = 0;
    let updatedToSuccess = 0;
    
    for (const doc of pendingOrders.docs) {
      const orderData = doc.data();
      const createdAt = orderData.createdAt ? orderData.createdAt.toDate() : null;
      
      if (!createdAt) continue; // Ignorer si pas de date de création
      
      const ageInMinutes = Math.floor((now - createdAt) / (1000 * 60));
      
      // Si commande en "En attente" et créée il y a plus de 5 minutes → passer à "en cours"
      if (orderData.status === 'En attente' && ageInMinutes >= 5) {
        await doc.ref.update({
          status: 'en cours',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoUpdated: true
        });
        updatedToInProgress++;
        console.log(`✅ Commande #${orderData.orderId} passée à "en cours" (${ageInMinutes} min)`);
        continue;
      }
      
      // Si commande en "en cours" → vérifier le temps de réalisation
      if (orderData.status === 'en cours') {
        let completionTimeMinutes = 0;
        
        // Parser le temps de réalisation (en minutes)
        if (orderData.time && orderData.time !== 'Instantané' && orderData.time !== 'N/A') {
          const timeStr = String(orderData.time);
          
          // Extraire les minutes du format "120 min" ou "2 h" etc.
          const minMatch = timeStr.match(/(\d+)\s*min/i);
          if (minMatch) {
            completionTimeMinutes = parseInt(minMatch[1]);
          } else {
            // Si c'est en heures, convertir
            const hourMatch = timeStr.match(/(\d+)\s*h/i);
            if (hourMatch) {
              completionTimeMinutes = parseInt(hourMatch[1]) * 60;
            }
          }
        }
        
        // Si temps non défini ou instantané, utiliser 5 minutes par défaut
        if (completionTimeMinutes === 0) {
          completionTimeMinutes = 5;
        }
        
        // Vérifier si le temps de réalisation est écoulé
        if (ageInMinutes >= completionTimeMinutes) {
          await doc.ref.update({
            status: 'succès',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            autoUpdated: true
          });
          updatedToSuccess++;
          console.log(`✅ Commande #${orderData.orderId} passée à "succès" (${ageInMinutes}/${completionTimeMinutes} min)`);
        }
      }
    }
    
    if (updatedToInProgress > 0 || updatedToSuccess > 0) {
      console.log(`🔄 Statuts mis à jour: ${updatedToInProgress} en cours, ${updatedToSuccess} succès`);
    }
    
  } catch (error) {
    console.error('❌ Erreur vérification statuts:', error);
  }
}

// Vérifier les statuts toutes les 5 minutes
cron.schedule('*/5 * * * *', () => {
  checkAndUpdateOrderStatuses();
}, {
  timezone: "Africa/Porto-Novo"
});

console.log('⏰ Tâche automatique configurée: Vérification des statuts toutes les 5 minutes');


// ─── VÉRIFICATION AUTOMATIQUE DES STATUTS DE RÉCLAMATIONS ───
async function checkAndUpdateReclamationStatuses() {
  try {
    if (!getDB()) {
      console.error('❌ Base de données non initialisée pour vérification des réclamations');
      return;
    }
    
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    // Récupérer toutes les réclamations en attente ou en cours
    const pendingReclamations = await getDB()
      .collection('reclamations')
      .where('status', 'in', ['En attente', 'en cours'])
      .get();
    
    if (pendingReclamations.empty) {
      return;
    }
    
    let updatedToInProgress = 0;
    let updatedToSuccess = 0;
    
    for (const doc of pendingReclamations.docs) {
      const reclamationData = doc.data();
      const createdAt = reclamationData.createdAt ? reclamationData.createdAt.toDate() : null;
      
      if (!createdAt) continue;
      
      const ageInMinutes = Math.floor((now - createdAt) / (1000 * 60));
      
      // Si réclamation en "En attente" et créée il y a plus de 15 minutes → passer à "en cours"
      if (reclamationData.status === 'En attente' && ageInMinutes >= 15) {
        await doc.ref.update({
          status: 'en cours',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoUpdated: true
        });
        updatedToInProgress++;
        console.log(`✅ Réclamation #${reclamationData.reclamationId} passée à "en cours" (${ageInMinutes} min)`);
        continue;
      }
      
      // Si réclamation en "en cours" et créée il y a plus de 2 heures (120 min) → passer à "succès"
      if (reclamationData.status === 'en cours' && ageInMinutes >= 120) {
        await doc.ref.update({
          status: 'succès',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoUpdated: true,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        updatedToSuccess++;
        console.log(`✅ Réclamation #${reclamationData.reclamationId} passée à "succès" (${ageInMinutes} min / 120 min requis)`);
      }
    }
    
    if (updatedToInProgress > 0 || updatedToSuccess > 0) {
      console.log(`🔄 Réclamations mises à jour: ${updatedToInProgress} en cours, ${updatedToSuccess} succès`);
    }
    
  } catch (error) {
    console.error('❌ Erreur vérification statuts réclamations:', error);
  }
}

// Vérifier les statuts des réclamations toutes les 5 minutes
cron.schedule('*/5 * * * *', () => {
  checkAndUpdateReclamationStatuses();
}, {
  timezone: "Africa/Porto-Novo"
});

console.log('⏰ Tâche automatique configurée: Vérification des statuts réclamations toutes les 5 minutes');


// ─── VÉRIFICATION AUTOMATIQUE DES PAIEMENTS ACCOUNTPE EN ATTENTE ───
async function checkPendingAccountPePayments() {
  try {
    if (!getDB()) {
      console.log('⚠️ DB non initialisée pour vérification paiements');
      return;
    }
    
    console.log('💳 Vérification des paiements AccountPe en attente...');
    
    // Récupérer les paiements créés il y a plus de 2 minutes et pas encore traités
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    // Récupérer TOUS les paiements avec statut 'created' (indépendamment du champ processed)
    // La vérification du champ 'processed' se fera après récupération pour éviter les problèmes Firestore
    const pendingPayments = await getDB().collection('payments')
      .where('status', '==', 'created')
      .limit(100)
      .get();
    
    if (pendingPayments.empty) {
      console.log('✅ Aucun paiement en attente à vérifier');
      return;
    }
    
    console.log(`📊 ${pendingPayments.size} paiements en attente à vérifier`);
    
    let processed = 0;
    let failed = 0;
    
    for (const doc of pendingPayments.docs) {
      const paymentData = doc.data();
      const transactionId = doc.id;
      
      // Ignorer les paiements déjà traités (vérification côté client car != ne fonctionne pas bien avec Firestore)
      if (paymentData.processed === true) {
        continue;
      }
      
      // Vérifier si le paiement a été créé il y a plus de 2 minutes
      let createdAt = null;
      if (paymentData.createdAt && typeof paymentData.createdAt.toDate === 'function') {
        createdAt = paymentData.createdAt.toDate();
      }
      
      if (createdAt && createdAt > twoMinutesAgo) {
        // Paiement trop récent, on attend encore
        continue;
      }
      
      try {
        // Vérifier le statut auprès d'AccountPe
        const token = await getAccountPeToken();
        
        const response = await fetch(`${ACCOUNTPE_CONFIG.baseUrl}/payment_link_status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ transaction_id: transactionId })
        });
        
        const data = await response.json();
        const rawStatus = data.data?.data?.attributes?.status ?? data.status;
        const isPaid = rawStatus === 1 || rawStatus === 'success' || rawStatus === 'paid';
        
        if (isPaid) {
          console.log(`💰 Paiement ${transactionId} confirmé par AccountPe - Traitement...`);
          await processSuccessfulPayment(transactionId);
          processed++;
        } else {
          // Marquer les paiements trop anciens (plus de 4 heures) comme expirés
          if (createdAt) {
            const ageInMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
            if (ageInMinutes > 240) {
              await doc.ref.update({
                status: 'expired',
                expiredAt: admin.firestore.FieldValue.serverTimestamp()
              });
              console.log(`⏰ Paiement ${transactionId} expiré (plus de 4 heures)`);
              failed++;
            }
          }
        }
        
        // Petit délai entre chaque vérification pour éviter de surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`❌ Erreur vérification paiement ${transactionId}:`, err.message);
      }
    }
    
    if (processed > 0 || failed > 0) {
      console.log(`💳 Résultat: ${processed} paiements traités, ${failed} expirés`);
    }
    
  } catch (error) {
    console.error('❌ Erreur vérification paiements AccountPe:', error);
  }
}

// Vérifier les paiements AccountPe toutes les 3 minutes
cron.schedule('*/3 * * * *', () => {
  checkPendingAccountPePayments();
}, {
  timezone: "Africa/Porto-Novo"
});

console.log('⏰ Tâche automatique configurée: Vérification paiements AccountPe toutes les 3 minutes');


// ─── VÉRIFICATION AUTOMATIQUE DES PAIEMENTS FAPSHI EN ATTENTE ───
async function checkPendingFapshiPayments() {
  try {
    if (!getDB()) {
      console.log('⚠️ DB non initialisée pour vérification paiements Fapshi');
      return;
    }
    
    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    
    if (!API_USER || !SECRET_KEY) {
      console.log('⚠️ Clés Fapshi non configurées');
      return;
    }
    
    console.log('💳 Vérification des paiements Fapshi en attente...');
    
    // Récupérer les paiements Fapshi avec statut PENDING créés il y a plus de 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    const pendingPayments = await getDB().collection('fapshiTransactions')
      .where('status', '==', 'PENDING')
      .limit(50)
      .get();
    
    if (pendingPayments.empty) {
      console.log('✅ Aucun paiement Fapshi en attente');
      return;
    }
    
    console.log(`📊 ${pendingPayments.size} paiements Fapshi en attente à vérifier`);
    
    let confirmed = 0;
    let failed = 0;
    
    for (const doc of pendingPayments.docs) {
      const paymentData = doc.data();
      const docId = doc.id;
      // Utiliser le fapshiTransId réel pour les appels API, sinon l'ID du document
      const fapshiTransId = paymentData.fapshiTransId || docId;
      
      // Vérifier si le paiement a été créé il y a plus de 2 minutes
      let createdAt = null;
      if (paymentData.dateInitiated && typeof paymentData.dateInitiated.toDate === 'function') {
        createdAt = paymentData.dateInitiated.toDate();
      }
      
      if (createdAt && createdAt > twoMinutesAgo) {
        // Paiement trop récent, on attend encore
        continue;
      }
      
      try {
        // Vérifier le statut auprès de Fapshi avec le vrai transId
        const response = await fetch(`https://live.fapshi.com/payment-status/${fapshiTransId}`, {
          method: 'GET',
          headers: {
            'apiuser': API_USER,
            'apikey': SECRET_KEY
          }
        });
        
        if (!response.ok) {
          console.error(`❌ Fapshi API erreur pour ${fapshiTransId} (doc: ${docId}): ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const status = (data.status || '').toUpperCase();
        
        console.log(`>>> Fapshi status check ${fapshiTransId} (doc: ${docId}): ${status}`);
        
        if (status === 'SUCCESSFUL') {
          console.log(`💰 Fapshi: Paiement ${fapshiTransId} confirmé - Traitement...`);
          
          const userId = paymentData.userId;
          const amount = paymentData.amount || data.amount;
          
          if (!userId) {
            console.error(`❌ Fapshi: userId manquant pour ${fapshiTransId}`);
            continue;
          }
          
          // Marquer la transaction comme confirmée
          await doc.ref.update({
            status: 'CONFIRMED',
            dateConfirmed: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // Mettre à jour le solde de l'utilisateur
          const userRef = getDB().collection('users').doc(userId);
          const parsedAmount = parseInt(amount);
          
          await getDB().runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            
            if (!userDoc.exists) {
              t.set(userRef, { balance: parsedAmount });
            } else {
              const currentBalance = userDoc.data().balance || 0;
              t.update(userRef, { balance: currentBalance + parsedAmount });
            }
          });
          
          console.log(`✅ Fapshi: Solde mis à jour pour ${userId}: +${parsedAmount} FCFA`);
          
          // Bonus parrainage (5%)
          const filleulDoc = await userRef.get();
          if (filleulDoc.exists) {
            const filleulData = filleulDoc.data();
            const parrainUid = filleulData?.referredBy;
            
            if (parrainUid) {
              const bonusParrain = Math.floor(parsedAmount * 0.05);
              
              if (bonusParrain > 0) {
                const parrainRef = getDB().collection('users').doc(parrainUid);
                
                await parrainRef.set({
                  referralBalance: admin.firestore.FieldValue.increment(bonusParrain)
                }, { merge: true });
                
                await parrainRef.collection('referrals').add({
                  refereeUid: userId,
                  amount: parsedAmount,
                  bonus: bonusParrain,
                  type: 'deposit_bonus_fapshi',
                  transactionId: fapshiTransId,
                  date: admin.firestore.FieldValue.serverTimestamp(),
                  status: 'completed'
                });
                
                console.log(`🎁 Fapshi: Bonus parrainage ${bonusParrain} FCFA pour ${parrainUid}`);
              }
            }
          }
          
          confirmed++;
          
        } else if (status === 'FAILED' || status === 'EXPIRED') {
          await doc.ref.update({
            status: 'FAILED',
            dateUpdated: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log(`❌ Fapshi: Paiement ${fapshiTransId} échoué`);
          failed++;
          
        } else if (createdAt) {
          // Vérifier si le paiement est trop ancien (plus de 4 heures)
          const ageInMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
          if (ageInMinutes > 240) {
            await doc.ref.update({
              status: 'EXPIRED',
              dateUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`⏰ Fapshi: Paiement ${fapshiTransId} expiré (plus de 4 heures)`);
            failed++;
          }
        }
        
        // Petit délai entre chaque vérification
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (err) {
        console.error(`❌ Erreur vérification Fapshi ${fapshiTransId}:`, err.message);
      }
    }
    
    if (confirmed > 0 || failed > 0) {
      console.log(`💳 Fapshi: ${confirmed} paiements confirmés, ${failed} échoués/expirés`);
    }
    
  } catch (error) {
    console.error('❌ Erreur vérification paiements Fapshi:', error);
  }
}

// Vérifier les paiements Fapshi toutes les 3 minutes (décalé de 90 secondes)
cron.schedule('1-59/3 * * * *', () => {
  checkPendingFapshiPayments();
}, {
  timezone: "Africa/Porto-Novo"
});

console.log('⏰ Tâche automatique configurée: Vérification paiements Fapshi toutes les 3 minutes');


// ─── VÉRIFICATION DES RAPPORTS PENDANTS (SYSTÈME PERSISTANT) ───────────────
// Vérifie toutes les heures si des rapports ont été manqués et les envoie
cron.schedule('0 * * * *', () => {
  console.log('⏰ Vérification horaire des rapports pendants...');
  checkAndSendPendingReports();
}, {
  timezone: "Africa/Porto-Novo"
});

console.log('⏰ Tâche automatique configurée: Vérification des rapports pendants toutes les heures');


// ─── MAPPING DES NOMS DE SERVICES (pour compatibilité avec apostrophes) ───
const serviceNameMapping = {
  // Facebook
  "J'aime (page)": "jaime_page",
  "jaime_page": "jaime_page",
  "J'aime (publication)": "jaime_publication",
  "jaime_publication": "jaime_publication",
  
  // Instagram
  "J'aime": "jaime",
  "jaime": "jaime",
  
  // YouTube
  // "J'aime": "jaime", // déjà défini
  
  // TikTok
  "J'aime pour direct": "jaime_direct",
  "jaime_direct": "jaime_direct",
  
  // Twitter
  "Likes (J'aime)": "likes_jaime",
  "likes_jaime": "likes_jaime"
};

// Fonction pour normaliser un nom de service
function normalizeServiceName(serviceName, platform) {
  if (!serviceName) return serviceName;
  
  // TOUS LES TYPES D'APOSTROPHES (codes UTF-8) → apostrophe droite (code 39)
  let normalized = serviceName
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`´ʼ]/g, "'")  // ' ' ‚ ‛ ′ ‵ ` ´ ʼ → '
    .replace(/\s+/g, ' ')  // Multiples espaces → un seul
    .trim();
  
  // Normaliser les accents pour la comparaison
  // é, è, ê, ë → e | à, â, ä → a | ù, û, ü → u | ô, ö → o | î, ï → i | ç → c
  const accentMap = {
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
    'à': 'a', 'â': 'a', 'ä': 'a', 'À': 'A', 'Â': 'A', 'Ä': 'A',
    'ù': 'u', 'û': 'u', 'ü': 'u', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
    'ô': 'o', 'ö': 'o', 'Ô': 'O', 'Ö': 'O',
    'î': 'i', 'ï': 'i', 'Î': 'I', 'Ï': 'I',
    'ç': 'c', 'Ç': 'C'
  };
  
  normalized = normalized.split('').map(char => accentMap[char] || char).join('');
  
  return normalized;
}

// ─── SERVICES DATA (CLÉS NORMALISÉES) ──────────────────────────────────
// ─── SERVICES DATA (CLES NORMALISEES) ──────────────────────────────────
const servicesData = {
  facebook: {
    "Followers (page)": {
      medium: { price: 1449, time: "2 h" },
      high:   { price: 1900, time: "1 h" },
      remark: "VOTRE COMMANDE PEUT PRENDRE UN PEU PLUS DE TEMPS QUE D'HABITUDE EN CAS DE MISE A JOUR DE FACEBOOK (min: 100)"
    },
    "Followers (profil)": {
      medium: { price: 1694, time: "3 h" },
      high:   { price: 1950, time: "2 h" },
      remark: "ASSUREZ-VOUS QUE LE PROFIL FACEBOOK EST EN MODE PROFESSIONNEL. (min: 100)"
    },
    "J'aime (page)": {
      medium: { price: 1900, time: "3 h" },
      high:   { price: 2300, time: "2 h" },
      remark: "Vous obtiendrez des followers en bonus. (min: 100)"
    },
    "J'aime (publication)": {
      medium: { price: 698, time: "2 h" },
      high:   { price: 950, time: "1 h" },
      remark: "Publication publique requise (min: 100)"
    },
    "Partages": {
      medium: { price: 990, time: "3 h" },
      high:   { price: 1330, time: "2 h" },
      remark: "Publication publique requise (min: 1000)"
    },
    "Membres de groupe": {
      medium: { price: 1495, time: "3 h" },
      high:   { price: 1980, time: "2 h" },
      remark: "Le groupe doit etre public (min: 100)"
    },
    "Vues de video": {
      medium: { price: 290, time: "4 h" },
      high:   { price: 460, time: "3 h" },
      remark: "Video publique requise (min: 500)"
    },
    "Commentaires personnalises": {
      subOptionLabel: "Type de commentaires",
      options: {
        "Commentaires Mondial": { medium: { price: 989, time: "24 h" }, high: { price: 1157, time: "18 h" } },
        "Commentaires Masculin": { medium: { price: 1089, time: "24 h" }, high: { price: 1257, time: "18 h" } },
        "Commentaires Feminin": { medium: { price: 1189, time: "24 h" }, high: { price: 1357, time: "18 h" } }
      },
      remark: "Prix pour 10 commentaires. Ce sont des comptes qui commenteront selon le genre choisi. (min: 10)"
    },
    "Reaction Emoji": {
      subOptionLabel: "Emoji a choisir",
      options: {
        "Reaction Love": { medium: { price: 777, time: "3 h" }, high: { price: 1100, time: "2 h" } },
        "Reaction Coeur": { medium: { price: 790, time: "3 h" }, high: { price: 1100, time: "2 h" } },
        "Reaction Rire": { medium: { price: 677, time: "3 h" }, high: { price: 1100, time: "2 h" } },
        "Reaction Wow": { medium: { price: 677, time: "3 h" }, high: { price: 1100, time: "2 h" } },
        "Reaction Triste": { medium: { price: 800, time: "3 h" }, high: { price: 1100, time: "2 h" } },
        "Reaction Colere": { medium: { price: 900, time: "3 h" }, high: { price: 1100, time: "2 h" } }
      },
      remark: "Choisissez l'emoji (min: 100)"
    },
    "Nigeria Service": {
      subOptionLabel: "Type de service Nigeria",
      options: {
        "Vues video Facebook Nigeria": { medium: { price: 7000, time: "4 h" }, high: { price: 15000, time: "3 h" } },
        "J'aime photo/post Nigeria": { medium: { price: 55400, time: "4 h" }, high: { price: 60000, time: "3 h" } },
        "Commentaires personnalises Nigeria": { medium: { price: 6100, time: "24 h" }, high: { price: 7500, time: "18 h" } },
        "Abonnes page Facebook Nigeria": { medium: { price: 66826, time: "6 h" }, high: { price: 75000, time: "4 h" } },
        "J'aime page Facebook Nigeria": { medium: { price: 66826, time: "6 h" }, high: { price: 75000, time: "4 h" } },
        "Partage publication/video Nigeria": { medium: { price: 8956, time: "4 h" }, high: { price: 12000, time: "3 h" } }
      },
      remark: "Services cibles pour le Nigeria.Des vrais comptes africains (min: 100)"
    },
    "Commentaires aleatoires": {
      subOptionLabel: "Type de commentaires",
      options: {
        "Commentaires aleatoires Mondial": { medium: { price: 1978, time: "24 h" }, high: { price: 2314, time: "18 h" } },
        "Commentaires aleatoires Masculin": { medium: { price: 2178, time: "24 h" }, high: { price: 2514, time: "18 h" } },
        "Commentaires aleatoires Feminin": { medium: { price: 2378, time: "24 h" }, high: { price: 2714, time: "18 h" } }
      },
      remark: "Prix pour 10 commentaires. Commentaires aleatoires positifs selon le genre choisi. (min: 10)"
    },
    "Avis page Facebook": {
      subOptionLabel: "Type d'avis",
      options: {
        "Avis personnalises (5 etoiles)": { medium: { price: 1500, time: "48 h" }, high: { price: 2500, time: "36 h" } },
        "Avis aleatoires positifs (5 etoiles)": { medium: { price: 2100, time: "48 h" }, high: { price: 7000, time: "36 h" } }
      },
      remark: "Prix pour 10 avis. Avis 5 etoiles pour votre page Facebook. Page professionnelle requise avec section avis activee. (min: 10)"
    }
  },
  instagram: {
    "Followers": {
      medium: { price: 2100, time: "1h" },
      high:   { price: 3650, time: "30 min" },
      remark: "Desactivez l'option A VERIFIER avant d'acheter. si vous ne le faites pas , vous ne serez pas remboursé (min: 100)"
    },
    "J'aime": {
      medium: { price: 396, time: "30 min" },
      high:   { price: 620, time: "25 min" },
      remark: "Video publique obligatoire (min: 100)"
    },
    "Vues de videos": {
      medium: { price: 99, time: "30 min" },
      high:   { price: 210, time: "10 min" },
      remark: "Compte non prive (min: 1000)"
    },
    "Commentaires personnalises": {
      medium: { price: 217, time: "4 h" },
      high:   { price: 339, time: "2 h" },
      remark: "Pas de @ ni # (min: 10)"
    },
    "Vues de story": {
      subOptionLabel: "Type de vues story",
      options: {
        "Vues story (asiatiques)": { medium: { price: 323, time: "30 min" }, high: { price: 557, time: "15 min" } },
        "Vues et impression de story": { medium: { price: 704, time: "30 min" }, high: { price: 900, time: "20 min" } },
        "Vues story + impression + visite profil": { medium: { price: 1414, time: "45 min" }, high: { price: 1800, time: "30 min" } },
        "J'aime sur story Instagram": { medium: { price: 1414, time: "45 min" }, high: { price: 1800, time: "30 min" } },
        "Vues story Instagram femme": { medium: { price: 1300, time: "45 min" }, high: { price: 1600, time: "30 min" } },
        "Vues story Instagram homme": { medium: { price: 1200, time: "45 min" }, high: { price: 1500, time: "30 min" } }
      },
      remark: "Options de vues pour stories (min: 100)"
    },
    "Afrique Service": {
      subOptionLabel: "Type de service Afrique",
      options: {
        "J'aime Instagram mixte africain": { medium: { price: 15842, time: "2 h" }, high: { price: 18000, time: "1 h" } },
        "Abonne reel Instagram mixte africain": { medium: { price: 18300, time: "3 h" }, high: { price: 22000, time: "2 h" } },
        "J'aime Instagram Afrique du Sud": { medium: { price: 52400, time: "3 h" }, high: { price: 58000, time: "2 h" } }
      },
      remark: "Services cibles Afrique (min: 100)"
    },
    "France Service": {
      subOptionLabel: "Type de service France",
      options: {
        "Commentaires personnalises Instagram France": { medium: { price: 11530, time: "24 h" }, high: { price: 14000, time: "18 h" } },
        "Abonne Instagram France": { medium: { price: 53000, time: "4 h" }, high: { price: 60000, time: "3 h" } },
        "J'aime Instagram France": { medium: { price: 36000, time: "2 h" }, high: { price: 42000, time: "1 h" } }
      },
      remark: "Services cibles France (min: 100)"
    },
    "J'aime pour commentaires": {
      medium: { price: 14188, time: "2 h" },
      high:   { price: 16000, time: "1 h" },
      remark: "J'aime sur un commentaire specifique (min: 100)"
    },
    "Commentaires aleatoires": {
      medium: { price: 750, time: "18 h" },
      high:   { price: 1350, time: "12 h" },
      remark: "Commentaires naturels et varies. Nous redigeons des commentaires selon l'humeur - comme de vrais commentaires. (min: 10)"
    }
  },
  youtube: {
    "Abonnes": {
      subOptionLabel: "Pays cible",
      options: {
        "Abonnes (Mondial)": { medium: { price: 19315, time: "24 h" }, high: { price: 23060, time: "15 h" } },
        "Abonnes Nigeria": { medium: { price: 75556, time: "48 h" }, high: { price: 90000, time: "36 h" } }
      },
      remark: "Baisse de 1-5% possible (min: 50)"
    },
    "Vues": {
      subOptionLabel: "Pays cible",
      options: {
        "Vues (Mondial)": { medium: { price: 1650, time: "9 h" }, high: { price: 1980, time: "8 h" } },
        "Vues Ghana": { medium: { price: 7350, time: "12 h" }, high: { price: 9000, time: "10 h" } },
        "Vues Nigeria": { medium: { price: 7350, time: "12 h" }, high: { price: 9000, time: "10 h" } }
      },
      remark: "Vues haute qualite (min: 500)"
    },
    "J'aime": {
      subOptionLabel: "Pays cible",
      options: {
        "J'aime (Mondial)": { medium: { price: 1394, time: "2 h" }, high: { price: 1750, time: "1 h" } },
        "J'aime Nigeria": { medium: { price: 22730, time: "4 h" }, high: { price: 38000, time: "3 h" } }
      },
      remark: "presqu'Aucune baisse (min: 500)"
    },
    "Commentaires personnalises": {
      subOptionLabel: "Pays cible",
      options: {
        "Commentaires (Mondial)": { medium: { price: 3219, time: "24 h" }, high: { price: 5489, time: "18 h" } },
        "Commentaires Nigeria": { medium: { price: 6900, time: "48 h" }, high: { price: 8500, time: "36 h" } }
      },
      remark: "Pas de @ ni # (min: 10)"
    },
    "Partages sociaux": {
      subOptionLabel: "Pays cible",
      options: {
        "Partages Afrique du Sud": { medium: { price: 5300, time: "6 h" }, high: { price: 7000, time: "4 h" } },
        "Partages Ghana": { medium: { price: 5300, time: "6 h" }, high: { price: 7000, time: "4 h" } },
        "Partages Nigeria": { medium: { price: 5300, time: "6 h" }, high: { price: 7000, time: "4 h" } }
      },
      remark: "Partages sur reseaux sociaux (min: 100)"
    },
    "Monetisation": {
      subOptionLabel: "Type de vues monetisation",
      options: {
        "Vues actives reelles sur YouTube": { medium: { price: 5565, time: "24 h" }, high: { price: 9000, time: "18 h" } },
        "Vues YouTube revenu monetisable": { medium: { price: 3961, time: "24 h" }, high: { price: 5000, time: "18 h" } },
        "Vues YouTube 100% reel avec engagement complet et revenu": { medium: { price: 3722, time: "24 h" }, high: { price: 4500, time: "18 h" } }
      },
      remark: "Vues pour monetisation (min: 1000)"
    },
    "Commentaires aleatoires": {
      medium: { price: 5690, time: "18 h" },
      high:   { price: 8080, time: "12 h" },
      remark: "Commentaires naturels et varies. Nous redigeons des commentaires selon l'humeur - comme de vrais commentaires. (min: 10)"
    }
  },
  tiktok: {
    "Followers": {
      subOptionLabel: "Pays cible",
      options: {
        "Followers (Mondial)": { medium: { price: 1997, time: "2 h" }, high: { price: 2567, time: "1 h" } },
        "Followers Allemagne": { medium: { price: 5657, time: "4 h" }, high: { price: 7000, time: "3 h" } },
        "Followers Nigeria": { medium: { price: 58000, time: "6 h" }, high: { price: 90000, time: "4 h" } }
      },
      remark: "Compte non prive (min: 100)"
    },
    "J'aime": {
      subOptionLabel: "Pays cible",
      options: {
        "J'aime (Mondial)": { medium: { price: 199, time: "30 min" }, high: { price: 378, time: "10 min" } },
        "J'aime Etats-Unis": { medium: { price: 1100, time: "1 h" }, high: { price: 1500, time: "45 min" } },
        "J'aime Royaume-Uni": { medium: { price: 1563, time: "1 h" }, high: { price: 2000, time: "45 min" } },
        "J'aime Italie": { medium: { price: 900, time: "1 h" }, high: { price: 1200, time: "45 min" } },
        "J'aime UE et Etats-Unis": { medium: { price: 20900, time: "2 h" }, high: { price: 25000, time: "1 h 30" } },
        "J'aime Bresil": { medium: { price: 700, time: "1 h" }, high: { price: 1000, time: "45 min" } },
        "J'aime Nigeria": { medium: { price: 55067, time: "4 h" }, high: { price: 65000, time: "3 h" } }
      },
      remark: "Lien direct video (min: 50)"
    },
    "Vues": {
      subOptionLabel: "Type de vues",
      options: {
        "Vues (Mondial)": { medium: { price: 88, time: "30 min" }, high: { price: 190, time: "15 min" } },
        "Vues Monetisation": { medium: { price: 1000, time: "2 h" }, high: { price: 1500, time: "1 h" } }
      },
      remark: "Video publique (min: 500)"
    },
    "Vues pays cibles": {
      subOptionLabel: "Pays cible",
      options: {
        "Vues Algerie": { medium: { price: 250, time: "1 h" }, high: { price: 400, time: "45 min" } },
        "Vues Guyane": { medium: { price: 250, time: "1 h" }, high: { price: 400, time: "45 min" } },
        "Vues Belgique": { medium: { price: 260, time: "1 h" }, high: { price: 420, time: "45 min" } },
        "Vues Tchad": { medium: { price: 260, time: "1 h" }, high: { price: 420, time: "45 min" } },
        "Vues Canada": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Cameroun": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Burkina Faso": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Bulgarie": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Botswana": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Benin": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Angola": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Zambie": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Soudan": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Maroc": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Martinique": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Mali": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Madagascar": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Guadeloupe": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Ghana": { medium: { price: 3200, time: "1 h 30" }, high: { price: 4000, time: "1 h" } },
        "Vues Allemagne": { medium: { price: 3200, time: "1 h 30" }, high: { price: 4000, time: "1 h" } },
        "Vues Gabon": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Egypte": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Republique Dominicaine": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Paraguay": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Guinee equatoriale": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues Salvador": { medium: { price: 1700, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Vues France": { medium: { price: 3200, time: "1 h 30" }, high: { price: 4000, time: "1 h" } },
        "Vues Nigeria": { medium: { price: 10976, time: "2 h" }, high: { price: 14000, time: "1 h 30" } }
      },
      remark: "Vues ciblees par pays (min: 500)"
    },
    "Sauvegarde de videos": {
      medium: { price: 190, time: "20 min" },
      high:   { price: 259, time: "10 min" },
      remark: "Video publique (min: 100)"
    },
    "Partages de videos": {
      medium: { price: 199, time: "30 min" },
      high:   { price: 380, time: "15 min" },
      remark: "Video publique (min: 100)"
    },
    "Commentaires personnalises": {
      subOptionLabel: "Type de commentaires",
      options: {
        "Commentaires (Mondial)": { medium: { price: 397, time: "1 h" }, high: { price: 569, time: "30 min" } },
        "Commentaires aleatoires": { medium: { price: 1780, time: "1 h" }, high: { price: 2200, time: "45 min" } },
        "Commentaires auto Nigeria": { medium: { price: 6683, time: "2 h" }, high: { price: 8000, time: "1 h 30" } }
      },
      remark: "Pas de @ ni # (min: 10)"
    },
    "Live/Direct TikTok": {
      subOptionLabel: "Type de service Live",
      options: {
        "J'aime pour le Live": { medium: { price: 750, time: "15 min" }, high: { price: 1000, time: "10 min" } },
        "Vues en direct (20 min)": { medium: { price: 2750, time: "20 min" }, high: { price: 3010, time: "20 min" } },
        "Vues en direct (1 h)": { medium: { price: 3800, time: "1 h" }, high: { price: 4010, time: "1 h" } },
        "Vues en direct (1 h 30)": { medium: { price: 5850, time: "1 h 30" }, high: { price: 6500, time: "1 h 30" } },
        "Commentaires en direct personnalises": { medium: { price: 1500, time: "30 min" }, high: { price: 2000, time: "20 min" } }
      },
      remark: "Services pour Live TikTok (min: 50)"
    }
  },
  telegram: {
    "Membres groupe/canal": {
      medium: { price: 1199, time: "3 h" },
      high:   { price: 2145, time: "1 h" },
      remark: "Lien public requis (min: 500)"
    },
    "Vues publication specifique": {
      subOptionLabel: "Qualite des vues",
      options: {
        "Qualite moyenne": { medium: { price: 165, time: "Instantane" }, high: { price: 165, time: "Instantane" } },
        "Haute qualite":   { medium: { price: 329, time: "Instantane" }, high: { price: 329, time: "Instantane" } }
      },
      remark: "Vues sur publication specifique."
    },
    "Vues des publications precedentes": {
      subOptionLabel: "Nombre de vues",
      options: {
        "20 vues":  { medium: { price: 968, time: "Instantane" }, high: { price: 1100, time: "Instantane" } },
        "50 vues":  { medium: { price: 1492, time: "Instantane" }, high: { price: 1948, time: "Instantane" } },
        "100 vues": { medium: { price: 2593, time: "Instantane" }, high: { price: 3176, time: "Instantane" } }
      },
      remark: "Choisissez le nombre de vues."
    },
    "Vues futures publications": {
      subOptionLabel: "Nombre de vues futures",
      options: {
        "20 futures vues":  { medium: { price: 1067,  time: "Instantane" }, high: { price: 1405, time: "Instantane" } },
        "50 futures vues":  { medium: { price: 2195, time: "Instantane" }, high: { price: 2593, time: "Instantane" } },
        "100 futures vues": { medium: { price: 4399, time: "Instantane" }, high: { price: 5059, time: "Instantane" } }
      },
      remark: "Vues pour futures publications."
    },
    "Reactions publication specifique": {
      medium: { price: 231, time: "Instantane" },
      high:   { price: 501, time: "Instantane" },
      remark: "Reaction sur publication (min: 10)"
    },
    "Reactions precedentes": {
      subOptionLabel: "Nombre de reactions",
      options: {
        "20 reactions":  { medium: { price: 1375, time: "Instantane" }, high: { price: 1375, time: "Instantane" } },
        "50 reactions":  { medium: { price: 3300, time: "Instantane" }, high: { price: 3300, time: "Instantane" } },
        "100 reactions": { medium: { price: 5500, time: "Instantane" }, high: { price: 5500, time: "Instantane" } }
      },
      remark: "Reactions sur publications precedentes."
    },
    "Reactions futures": {
      subOptionLabel: "Nombre de reactions futures",
      options: {
        "20 reactions":  { medium: { price: 1375, time: "Instantane" }, high: { price: 1375, time: "Instantane" } },
        "50 reactions":  { medium: { price: 3300, time: "Instantane" }, high: { price: 3300, time: "Instantane" } },
        "100 reactions": { medium: { price: 5500, time: "Instantane" }, high: { price: 5500, time: "Instantane" } }
      },
      remark: "Reactions sur futures publications."
    },
    "Votes": {
      medium: { price: 1320, time: "1 h" },
      high:   { price: 1980, time: "30 min" },
      remark: "Votes pour sondages Telegram (min: 100)"
    },
    "Commentaires": {
      subOptionLabel: "Pays cible",
      options: {
        "Commentaires Etats-Unis": { medium: { price: 6026, time: "4 h" }, high: { price: 7700, time: "3 h" } },
        "Commentaires Turquie": { medium: { price: 6026, time: "4 h" }, high: { price: 7700, time: "3 h" } },
        "Commentaires Chine": { medium: { price: 6026, time: "4 h" }, high: { price: 7700, time: "3 h" } },
        "Commentaires Allemagne": { medium: { price: 6026, time: "4 h" }, high: { price: 7700, time: "3 h" } }
      },
      remark: "Commentaires cibles (min: 10)"
    },
    "Partage Premium": {
      subOptionLabel: "Type de partage",
      options: {
        "Partage Premium reussi": { medium: { price: 4400, time: "2 h" }, high: { price: 6050, time: "1 h" } },
        "Partage Premium pays mixte": { medium: { price: 4400, time: "2 h" }, high: { price: 6050, time: "1 h" } }
      },
      remark: "Partages premium (min: 100)"
    }
  },
  twitter: {
    "Followers": {
      medium: { price: 7238, time: "4 h" },
      high:   { price: 8053, time: "3 h" },
      remark: "Profil public requis (min: 100)"
    },
    "Likes (J'aime)": {
      medium: { price: 2167, time: "2 h" },
      high:   { price: 2728, time: "1 h" },
      remark: "Tweet public (min: 50)"
    },
    "Retweets": {
      medium: { price: 5940, time: "3 h" },
      high:   { price: 7711, time: "2 h" },
      remark: "Tweet public requis (min: 50)"
    },
    "Vues de video (Twitter)": {
      medium: { price: 5500, time: "5 h" },
      high:   { price: 7700, time: "4 h" },
      remark: "Lien video Twitter (min: 500)"
    },
    "Commentaires personnalises": {
      medium: { price: 6226, time: "20 h" },
      high:   { price: 8360, time: "18 h" },
      remark: "Prix pour 10 commentaires. Un commentaire par ligne (min: 10)"
    },
    "Vote Poll/Sondage": {
      medium: { price: 16500, time: "4 h" },
      high:   { price: 22000, time: "3 h" },
      remark: "Votes pour sondages Twitter (min: 100)"
    },
    "Commentaires aleatoires": {
      medium: { price: 12452, time: "18 h" },
      high:   { price: 16720, time: "12 h" },
      remark: "Prix pour 10 commentaires. Commentaires naturels et varies. (min: 10)"
    }
  },
  whatsapp: {
    "Abonnes internationaux": {
      medium: { price: 4433, time: "3 h" },
      high:   { price: 7711, time: "2 h" },
      remark: "Abonnes de pays aleatoires (min: 100)"
    },
    "Abonnes americains": {
      medium: { price: 4873, time: "3 h" },
      high:   { price: 6050, time: "3 h" },
      remark: "Abonnes USA (min: 100)"
    },
    "Abonnes indiens": {
      medium: { price: 4873, time: "3 h" },
      high:   { price: 6050, time: "3 h" },
      remark: "Abonnes Inde (min: 100)"
    },
    "Reaction Emoji": {
      subOptionLabel: "Emoji a choisir",
      options: {
        "Reaction Pouce": { medium: { price: 1144, time: "5h" }, high: { price: 3058, time: "Instantane" } },
        "Reaction Coeur": { medium: { price: 1144, time: "5h" }, high: { price: 3058, time: "Instantane" } },
        "Reaction Rire": { medium: { price: 1144, time: "5h" }, high: { price: 3058, time: "Instantane" } },
        "Reaction aleatoires": { medium: { price: 2090, time: "30 min" }, high: { price: 3850, time: "15 min" } }
      },
      remark: "Emoji react sur messages (min: 100)"
    }
  },
  spotify: {
    "Followers": {
      medium: { price: 4345, time: "3 h" },
      high:   { price: 4961, time: "2 h" },
      remark: "Profil public requis (min: 500)"
    },
    "Abonnes a la playlist": {
      medium: { price: 3850, time: "2 h" },
      high:   { price: 4565, time: "1 h" },
      remark: "Lien playlist requis (min: 500)"
    }
  },
  linkedin: {
    "Abonnes pour votre page": {
      medium: { price: 8250, time: "5 h" },
      high:   { price: 8800, time: "4 h" },
      remark: "Page publique requise (min: 500)"
    },
    "Abonnes pour votre profil": {
      medium: { price: 8470, time: "5 h" },
      high:   { price: 9570, time: "4 h" },
      remark: "Profil professionnel requis (min: 500)"
    },
    "Likes postes": {
      medium: { price: 38500, time: "7 h" },
      high:   { price: 44000, time: "6 h" },
      remark: "Posts publics requis (min: 100)"
    },
    "Commentaires aleatoires": {
      medium: { price: 3850, time: "18 h" },
      high:   { price: 5500, time: "12 h" },
      remark: "Prix pour 10 commentaires. Commentaires naturels et varies. (min: 10)"
    }
  },
  snapchat: {
    "Abonnes": {
      subOptionLabel: "Pays cible",
      options: {
        "Abonnes Allemagne": { medium: { price: 71830, time: "24 h" }, high: { price: 77000, time: "18 h" } },
        "Abonnes France": { medium: { price: 71830, time: "24 h" }, high: { price: 77000, time: "18 h" } },
        "Abonnes Mix Mondial": { medium: { price: 52792, time: "12 h" }, high: { price: 60885, time: "8 h" } },
        "Abonnes Europe": { medium: { price: 52792, time: "12 h" }, high: { price: 60885, time: "8 h" } }
      },
      remark: "Abonnes Snapchat cibles par region (min: 100)"
    },
    "Demande d'amis": {
      subOptionLabel: "Type de demande",
      options: {
        "Abonne/Amis": { medium: { price: 71830, time: "24 h" }, high: { price: 77330, time: "18 h" } },
        "Demande d'ami": { medium: { price: 44330, time: "12 h" }, high: { price: 55330, time: "8 h" } }
      },
      remark: "Demandes d'amis Snapchat (min: 100)"
    },
    "Likes": {
      subOptionLabel: "Type de like",
      options: {
        "Like video Snapchat": { medium: { price: 28930, time: "4 h" }, high: { price: 38940, time: "2 h" } }
      },
      remark: "Likes sur videos Snapchat (min: 100)"
    },
    "Vues": {
      medium: { price: 9625, time: "2 h" },
      high:   { price: 13420, time: "1 h" },
      remark: "Vues sur stories/videos Snapchat (min: 100)"
    },
    "Commentaires aleatoires": {
      medium: { price: 2750, time: "18 h" },
      high:   { price: 4400, time: "12 h" },
      remark: "Prix pour 10 commentaires. Commentaires naturels et varies. (min: 10)"
    }
  }
};

// ─── FONCTIONS UTILES ────────────────────────────────────────────────────
function toE164(phone) {
  let num = String(phone || '').replace(/[^\d+]/g, '');
  if (!num) return '';
  if (!num.startsWith('+')) num = '+' + num;
  return num;
}

// Fonction pour convertir le temps en millisecondes
// Convertir le temps en MINUTES uniquement (pour stockage en BDD)
function convertTimeToMinutes(timeStr) {
  // Valeur par défaut de 2h si temps non défini ou N/A
  if (!timeStr || timeStr === 'N/A' || timeStr === 'undefined') {
    return '120 min'; // 2 heures par défaut
  }
  if (timeStr === 'Instantané') return 'Instantané';
  
  let totalMinutes = 0;
  
  // Extraire les heures (1h, 2 h, 24h, 48 h, etc.)
  const hoursMatch = timeStr.match(/(\d+)\s*h(?:eure)?s?/i);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1]);
    totalMinutes += hours * 60;
  }
  
  // Extraire les minutes (30min, 15 min, etc.)
  const minutesMatch = timeStr.match(/(\d+)\s*min(?:ute)?s?/i);
  if (minutesMatch) {
    const mins = parseInt(minutesMatch[1]);
    totalMinutes += mins;
  }
  
  // Retourner en format "X min" pour uniformiser
  return totalMinutes > 0 ? `${totalMinutes} min` : 'Instantané';
}

function parseTimeToMs(timeStr) {
  // Valeur par défaut de 2h si temps non défini ou N/A
  if (!timeStr || timeStr === 'N/A' || timeStr === 'undefined') {
    console.log(`⏰ Temps non defini, utilisation de 2h par defaut`);
    return 2 * 60 * 60 * 1000; // 2 heures = 7200000 ms
  }
  if (timeStr === 'Instantané') return 0;
  
  let totalMinutes = 0;
  
  // Extraire les heures - AMÉLIORATION : Formats multiples (2h, 2 h, 2H, 2 H, 2 heures)
  const hoursMatch = timeStr.match(/(\d+)\s*h(?:eure)?s?/i);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1]);
    totalMinutes += hours * 60;
    console.log(`⏰ Parsing: ${timeStr} → ${hours} heure(s) = ${hours * 60} minutes`);
  }
  
  // Extraire les minutes - AMÉLIORATION : Formats multiples (30min, 30 min, 30 minutes)
  const minutesMatch = timeStr.match(/(\d+)\s*min(?:ute)?s?/i);
  if (minutesMatch) {
    const mins = parseInt(minutesMatch[1]);
    totalMinutes += mins;
    console.log(`⏰ Parsing: ${timeStr} → ${mins} minute(s)`);
  }
  
  const milliseconds = totalMinutes * 60 * 1000;
  console.log(`⏰ TOTAL: ${timeStr} → ${totalMinutes} minutes = ${milliseconds}ms`);
  
  return milliseconds; // Convertir en millisecondes
}

// Fonction pour mettre à jour le statut d'une commande
async function updateOrderStatus(orderDocRef, newStatus) {
  try {
    await orderDocRef.update({ 
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Statut mis à jour: ${newStatus} pour commande ${orderDocRef.id}`);
  } catch (err) {
    console.error(`❌ Erreur mise à jour statut pour ${orderDocRef.id}:`, err);
  }
}

async function getNextOrderId() {
  if (!getDB()) throw new Error('Firestore non initialisé (getNextOrderId).');
  const counterRef = getDB().collection('counters').doc('commandes');
  try {
    let newOrderId;
    await getDB().runTransaction(async (transaction) => {
      const doc = await transaction.get(counterRef);
      if (!doc.exists) {
        newOrderId = 1;
        transaction.set(counterRef, { seq: 1 });
      } else {
        newOrderId = doc.data().seq + 1;
        transaction.update(counterRef, { seq: newOrderId });
      }
    });
    return newOrderId;
  } catch (error) {
    console.error('❌ Erreur getNextOrderId:', error);
    throw error;
  }
}

// ─── MIDDLEWARES ────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir les fichiers statiques EN PREMIER pour que le site soit accessible
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint sur /health au lieu de / pour ne pas bloquer l'accès au site
app.get('/health', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ 
    ok: true,
    status: 'healthy',
    service: "Social Boost Horizon API",
    timestamp: new Date().toISOString()
  });
});

// Middleware pour s'assurer que les routes API retournent du JSON
// Ne pas appliquer aux fichiers statiques (.html, .css, .js, etc.)
app.use((req, res, next) => {
  const staticExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const isStaticFile = staticExtensions.some(ext => req.originalUrl.includes(ext));
  const isApiRoute = req.originalUrl.startsWith('/api') || 
                     req.originalUrl.startsWith('/upload') ||
                     req.originalUrl.startsWith('/commande') ||
                     req.originalUrl.startsWith('/register') ||
                     req.originalUrl.startsWith('/login') ||
                     req.originalUrl.startsWith('/recharge') ||
                     req.originalUrl.startsWith('/user') ||
                     req.originalUrl.startsWith('/health');
  
  if (isApiRoute && !isStaticFile) {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// Gestion explicite des prérequêtes OPTIONS
app.options('*', cors());

// Logger simple (méthode, url, status, temps)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// ─── MULTER & UPLOADS ───────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ─── WHITELIST DESTINATAIRES POUR PREUVES ───────────────────────────────
const allowedRecipients = [
  '699853665',
  '652205768',
  '+237652205768',
  '+237 652205768',
  '+2250767482047',
  '0767482047',
  '990435965'
];

// ─── OCR HELPERS ─────────────────────────────────────────────────────────
async function extraireTexte(imagePath) {
  const worker = await createWorker();
  try {
    const { data:{ text } } = await worker.recognize(imagePath);
    return text;
  } finally {
    await worker.terminate();
  }
}

async function extraireMontantFCFA(text) {
  let m = text.match(/Montant\s*(?:Transaction)?\s*[:\-]?\s*([\d.,]+)\s*FCFA/i)
       || text.match(/([\d.,]+)\s*FCFA/i);
  return m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : 0;
}

// ─── VALIDATION UTILISATEUR ──────────────────────────────────────────────
function validateUser(req, res, next) {
  const given = req.userId || req.params.userId || req.body.userId || req.query.userId;
  if (!given) return res.status(400).json({ success:false, error:'User ID manquant.' });
  req.userId = given;
  next();
}

// ─── MIDDLEWARE D'AUTHENTIFICATION PAR TOKEN ─────────────────────────────
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success:false, error: 'Accès non autorisé. Token manquant.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Erreur de vérification du token:', error);
    return res.status(401).json({ success:false, error: 'Token invalide.' });
  }
}

// ─── MIDDLEWARE AUTHENTIFICATION PAR CLÉ API ────────────────────────────

async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ success: false, error: 'Clé API manquante. Ajoutez le header X-Api-Key.' });
  }

  if (!getDB()) {
    return res.status(500).json({ success: false, error: 'Service temporairement indisponible.' });
  }

  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  try {
    const usersSnapshot = await getDB().collection('users')
      .where('apiKeyHash', '==', apiKeyHash)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(401).json({ success: false, error: 'Clé API invalide.' });
    }

    const userDoc = usersSnapshot.docs[0];
    req.userId = userDoc.id;
    req.userData = userDoc.data();
    next();
  } catch (error) {
    console.error('Erreur authentification API key:', error);
    return res.status(500).json({ success: false, error: 'Erreur d\'authentification.' });
  }
}

// ─── ENDPOINTS GESTION CLÉ API ─────────────────────────────────────────

app.post('/api/user/generate-api-key', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const apiKey = 'sbh_' + crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const apiKeyPrefix = apiKey.substring(0, 12);

    await getDB().collection('users').doc(userId).update({
      apiKeyHash: apiKeyHash,
      apiKeyPrefix: apiKeyPrefix,
      apiKeyCreatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`🔑 Nouvelle clé API générée pour l'utilisateur ${userId}`);
    res.json({
      success: true,
      apiKey: apiKey,
      prefix: apiKeyPrefix,
      message: 'Clé API générée avec succès. Conservez-la précieusement, elle ne sera plus affichée.'
    });
  } catch (error) {
    console.error('Erreur génération clé API:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la génération de la clé API.' });
  }
});

app.get('/api/user/api-key-info', authenticateToken, async (req, res) => {
  try {
    const userDoc = await getDB().collection('users').doc(req.userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }
    const data = userDoc.data();
    if (data.apiKeyHash) {
      res.json({
        success: true,
        hasApiKey: true,
        prefix: data.apiKeyPrefix || 'sbh_****',
        createdAt: data.apiKeyCreatedAt ? (data.apiKeyCreatedAt.toDate ? data.apiKeyCreatedAt.toDate().toISOString() : data.apiKeyCreatedAt) : null
      });
    } else {
      res.json({ success: true, hasApiKey: false });
    }
  } catch (error) {
    console.error('Erreur récupération info clé API:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.post('/api/user/revoke-api-key', authenticateToken, async (req, res) => {
  try {
    await getDB().collection('users').doc(req.userId).update({
      apiKeyHash: admin.firestore.FieldValue.delete(),
      apiKeyPrefix: admin.firestore.FieldValue.delete(),
      apiKeyCreatedAt: admin.firestore.FieldValue.delete()
    });
    console.log(`🔑 Clé API révoquée pour l'utilisateur ${req.userId}`);
    res.json({ success: true, message: 'Clé API révoquée avec succès.' });
  } catch (error) {
    console.error('Erreur révocation clé API:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la révocation.' });
  }
});

// ─── API PUBLIQUE v1 (authentification par clé API) ─────────────────────

app.get('/api/v1/balance', authenticateApiKey, async (req, res) => {
  try {
    const userDoc = await getDB().collection('users').doc(req.userId).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    const data = userDoc.data();
    res.json({
      success: true,
      balance: data.balance || 0,
      currency: 'XAF'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

const API_CATALOG_MAP = { 'standard': 'exo', 'premium': 'mtp', 'gold': 'smmgen' };
const API_CATALOG_REVERSE = { 'exo': 'standard', 'mtp': 'premium', 'smmgen': 'gold' };

app.get('/api/v1/services', authenticateApiKey, async (req, res) => {
  try {
    const allServices = [];
    const filterCatalog = req.query.catalog ? API_CATALOG_MAP[req.query.catalog] : null;

    const PROVIDER_NAME_PATTERNS = /morethanpanel|exosupplier|smmgen|exo[\s_-]?supplier|more[\s_-]?than[\s_-]?panel/gi;
    function sanitizeProviderText(text) {
      if (!text) return '';
      return text.replace(PROVIDER_NAME_PATTERNS, 'Social Boost Horizon').trim();
    }

    if (!filterCatalog || filterCatalog === 'exo') {
      const exoServices = await getExoSupplierServices().catch(() => []);
      if (Array.isArray(exoServices)) {
        exoServices.forEach(service => {
          const priceUSD = parseFloat(service.rate) || 0;
          const priceXAF = priceUSD * EXOSUPPLIER_CONFIG.usdToXafRate * EXOSUPPLIER_CONFIG.priceMultiplier;
          allServices.push({
            service_id: String(service.service),
            name: sanitizeProviderText(service.name),
            category: sanitizeProviderText(service.category || ''),
            type: service.type || 'Default',
            price_per_1000: Math.round(priceXAF * 100) / 100,
            min: parseInt(service.min) || 1,
            max: parseInt(service.max) || 1000000,
            refill: service.refill === true || service.refill === 'true',
            cancel: service.cancel === true || service.cancel === 'true',
            description: sanitizeProviderText(service.desc || ''),
            catalog: 'standard'
          });
        });
      }
    }

    if (!filterCatalog || filterCatalog === 'mtp') {
      const mtpServices = await callMoreThanPanelAPI({ action: 'services' }).catch(() => []);
      if (Array.isArray(mtpServices)) {
        mtpServices.forEach(service => {
          const priceUSD = parseFloat(service.rate) || 0;
          const priceXAF = priceUSD * MORETHANPANEL_CONFIG.usdToXafRate * MORETHANPANEL_CONFIG.priceMultiplier;
          allServices.push({
            service_id: String(service.service),
            name: sanitizeProviderText(service.name),
            category: sanitizeProviderText(service.category || ''),
            type: service.type || 'Default',
            price_per_1000: Math.round(priceXAF * 100) / 100,
            min: parseInt(service.min) || 1,
            max: parseInt(service.max) || 1000000,
            refill: service.refill === true || service.refill === 'true',
            cancel: service.cancel === true || service.cancel === 'true',
            description: sanitizeProviderText(service.desc || ''),
            catalog: 'premium'
          });
        });
      }
    }

    if (!filterCatalog || filterCatalog === 'smmgen') {
      const smmgenServices = await callSMMGenAPI({ action: 'services' }).catch(() => []);
      if (Array.isArray(smmgenServices)) {
        smmgenServices.forEach(service => {
          const priceUSD = parseFloat(service.rate) || 0;
          const priceXAF = priceUSD * (SMMGEN_CONFIG ? SMMGEN_CONFIG.usdToXafRate : 600) * (SMMGEN_CONFIG ? SMMGEN_CONFIG.priceMultiplier : 3.5);
          allServices.push({
            service_id: String(service.service),
            name: sanitizeProviderText(service.name),
            category: sanitizeProviderText(service.category || ''),
            type: service.type || 'Default',
            price_per_1000: Math.round(priceXAF * 100) / 100,
            min: parseInt(service.min) || 1,
            max: parseInt(service.max) || 1000000,
            refill: service.refill === true || service.refill === 'true',
            cancel: service.cancel === true || service.cancel === 'true',
            description: sanitizeProviderText(service.desc || ''),
            catalog: 'gold'
          });
        });
      }
    }

    res.json({
      success: true,
      services: allServices,
      total: allServices.length,
      catalogs: ['standard', 'premium', 'gold']
    });
  } catch (error) {
    console.error('Erreur API v1 services:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des services.' });
  }
});

app.post('/api/v1/order', authenticateApiKey, async (req, res) => {
  try {
    const userId = req.userId;
    const { service_id, link, quantity, comments, catalog } = req.body;

    if (!service_id || !link || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'Paramètres requis: service_id, link, quantity'
      });
    }

    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'Le lien doit commencer par http:// ou https://' });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ success: false, error: 'La quantité doit être un nombre positif.' });
    }

    const selectedCatalog = catalog || 'standard';
    const selectedProvider = API_CATALOG_MAP[selectedCatalog];

    if (!selectedProvider) {
      return res.status(400).json({ success: false, error: 'Catalogue invalide. Utilisez: standard, premium, gold' });
    }

    let totalPriceXAF = 0;
    let serviceInfo = null;
    let providerOrderId = null;
    let collectionName = '';
    let orderPrefix = '';
    let counterDoc = '';

    if (selectedProvider === 'exo') {
      const exoServices = await getExoSupplierServices();
      serviceInfo = exoServices.find(s => String(s.service) === String(service_id));
      if (!serviceInfo) return res.status(400).json({ success: false, error: 'Service ExoSupplier non trouvé.' });

      const priceUSD = parseFloat(serviceInfo.rate) || 0;
      const priceXAFper1000 = priceUSD * EXOSUPPLIER_CONFIG.usdToXafRate * EXOSUPPLIER_CONFIG.priceMultiplier;
      const isPackage = serviceInfo.type === 'Package';
      const isPerOne = isPerOneService(serviceInfo);

      if (isPackage || isPerOne) {
        totalPriceXAF = priceXAFper1000 * qty;
      } else {
        totalPriceXAF = (priceXAFper1000 / 1000) * qty;
      }
      totalPriceXAF = Math.round(totalPriceXAF * 100) / 100;
      collectionName = 'commandes';
      orderPrefix = 'SBH-';
      counterDoc = 'commandes';

    } else if (selectedProvider === 'mtp') {
      const priceData = await calculateMTPPrice(service_id, qty);
      totalPriceXAF = priceData.totalPriceXAF;
      serviceInfo = priceData.service;
      collectionName = 'autoOrders';
      orderPrefix = 'AUTO_SBH_';
      counterDoc = 'autoOrders';

    } else if (selectedProvider === 'smmgen') {
      const priceData = await calculateSMMGenPrice(service_id, qty);
      totalPriceXAF = priceData.totalPriceXAF;
      serviceInfo = priceData.service;
      collectionName = 'autoOrders';
      orderPrefix = 'AUTO_SBH_';
      counterDoc = 'autoOrders';
    }

    const userRef = getDB().collection('users').doc(userId);
    const counterRef = getDB().collection('counters').doc(counterDoc);
    let orderNumber = 1;
    let newBalance = 0;

    await getDB().runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const cDoc = await transaction.get(counterRef);

      if (!userDoc.exists) throw new Error('Utilisateur non trouvé');

      const currentBalance = userDoc.data().balance || 0;
      if (currentBalance < totalPriceXAF) {
        throw new Error(`Solde insuffisant. Requis: ${totalPriceXAF.toFixed(2)} XAF, Disponible: ${currentBalance.toFixed(2)} XAF`);
      }

      newBalance = currentBalance - totalPriceXAF;
      orderNumber = (cDoc.exists ? (cDoc.data().count || 0) : 0) + 1;

      transaction.update(userRef, { balance: newBalance });
      transaction.set(counterRef, { count: orderNumber }, { merge: true });
    });

    const orderId = orderPrefix + String(orderNumber).padStart(4, '0');

    try {
      if (selectedProvider === 'exo') {
        const exoParams = { key: process.env.EXOSUPPLIER_API_KEY, action: 'add', service: service_id.toString(), link, quantity: qty.toString() };
        if (comments) exoParams.comments = comments;
        const exoResponse = await fetch('https://exosupplier.com/api/v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exoParams) });
        const exoData = await exoResponse.json();
        if (exoData.order) {
          providerOrderId = exoData.order.toString();
        } else {
          throw new Error(exoData.error || 'Erreur fournisseur ExoSupplier');
        }
      } else if (selectedProvider === 'mtp') {
        const mtpParams = { action: 'add', service: service_id.toString(), link, quantity: qty.toString() };
        if (comments) mtpParams.comments = comments;
        const mtpResult = await callMoreThanPanelAPI(mtpParams);
        if (mtpResult && mtpResult.order) {
          providerOrderId = mtpResult.order.toString();
        } else {
          throw new Error(mtpResult?.error || 'Erreur fournisseur MoreThanPanel');
        }
      } else if (selectedProvider === 'smmgen') {
        const smmParams = { action: 'add', service: service_id.toString(), link, quantity: qty.toString() };
        if (comments) smmParams.comments = comments;
        const smmResult = await callSMMGenAPI(smmParams);
        if (smmResult && smmResult.order) {
          providerOrderId = smmResult.order.toString();
        } else {
          throw new Error(smmResult?.error || 'Erreur fournisseur SMMGen');
        }
      }
    } catch (providerError) {
      console.error(`❌ Erreur fournisseur ${selectedProvider}:`, providerError.message);
      await getDB().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (userDoc.exists) {
          transaction.update(userRef, { balance: (userDoc.data().balance || 0) + totalPriceXAF });
        }
      });
      return res.status(502).json({
        success: false,
        error: `Erreur fournisseur: ${providerError.message}. Votre solde a été remboursé.`,
        refunded: true
      });
    }

    const orderData = {
      orderId: orderId,
      userId: userId,
      link: link,
      quantity: qty,
      totalPrice: totalPriceXAF,
      status: 'En cours',
      provider: selectedProvider,
      providerOrderId: providerOrderId,
      source: 'api',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (selectedProvider === 'exo') {
      orderData.serviceName = serviceInfo.name || '';
      orderData.exoOrderId = providerOrderId;
      orderData.isAutoOrder = true;
      orderData.finalCost = totalPriceXAF;
    } else {
      orderData.serviceName = serviceInfo.name || '';
      orderData.serviceId = service_id;
    }

    await getDB().collection(collectionName).add(orderData);

    console.log(`🔑 API v1 Commande: ${orderId} (${selectedProvider}) par user ${userId} - ${totalPriceXAF} XAF`);

    res.json({
      success: true,
      order_id: orderId,
      catalog: selectedCatalog,
      service: serviceInfo.name || service_id,
      quantity: qty,
      price: totalPriceXAF,
      currency: 'XAF',
      balance: newBalance,
      status: 'En cours'
    });

  } catch (error) {
    console.error('Erreur API v1 order:', error);
    res.status(error.message.includes('Solde insuffisant') ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/order/:orderId', authenticateApiKey, async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;

    let orderDoc = null;

    const commandesSnap = await getDB().collection('commandes')
      .where('userId', '==', userId)
      .where('orderId', '==', orderId)
      .limit(1)
      .get();

    if (!commandesSnap.empty) {
      orderDoc = commandesSnap.docs[0];
    } else {
      const autoSnap = await getDB().collection('autoOrders')
        .where('userId', '==', userId)
        .where('orderId', '==', orderId)
        .limit(1)
        .get();
      if (!autoSnap.empty) {
        orderDoc = autoSnap.docs[0];
      }
    }

    if (!orderDoc) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée.' });
    }

    const data = orderDoc.data();
    res.json({
      success: true,
      order: {
        order_id: data.orderId,
        service: data.serviceName || '',
        link: data.link || '',
        quantity: data.quantity || 0,
        price: data.totalPrice || data.finalCost || 0,
        currency: 'XAF',
        status: data.status || 'En attente',
        catalog: API_CATALOG_REVERSE[data.provider] || 'standard',
        start_count: data.providerStartCount || data.startCount || null,
        remains: data.providerRemains || data.remains || null,
        created_at: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null
      }
    });
  } catch (error) {
    console.error('Erreur API v1 order status:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

app.get('/api/v1/orders', authenticateApiKey, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const orders = [];

    const commandesSnap = await getDB().collection('commandes')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    commandesSnap.forEach(doc => {
      const d = doc.data();
      orders.push({
        order_id: d.orderId,
        service: d.serviceName || '',
        link: d.link || '',
        quantity: d.quantity || 0,
        price: d.totalPrice || d.finalCost || 0,
        currency: 'XAF',
        status: d.status || 'En attente',
        catalog: API_CATALOG_REVERSE[d.provider] || 'standard',
        created_at: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt) : null
      });
    });

    const autoSnap = await getDB().collection('autoOrders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    autoSnap.forEach(doc => {
      const d = doc.data();
      orders.push({
        order_id: d.orderId,
        service: d.serviceName || '',
        link: d.link || '',
        quantity: d.quantity || 0,
        price: d.totalPrice || 0,
        currency: 'XAF',
        status: d.status || 'En cours',
        catalog: API_CATALOG_REVERSE[d.provider] || 'premium',
        created_at: d.createdAt ? (d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt) : null
      });
    });

    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      orders: orders.slice(0, limit),
      total: orders.length
    });
  } catch (error) {
    console.error('Erreur API v1 orders:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur.' });
  }
});

// ─── ROUTES API ─────────────────────────────────────────────────────────

// Health check (toujours JSON)
app.get('/health', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ 
    ok: true, 
    time: new Date().toISOString(),
    service: "Social Boost Horizon API",
    version: "1.0"
  });
});

// LISTER TOUS LES SERVICES DISPONIBLES (pour débogage)
app.get('/services', (_req, res) => {
  try {
    const servicesList = {};
    
    Object.keys(servicesData).forEach(platform => {
      servicesList[platform] = Object.keys(servicesData[platform]).map(serviceName => ({
        name: serviceName,
        hasOptions: !!servicesData[platform][serviceName].options,
        options: servicesData[platform][serviceName].options ? Object.keys(servicesData[platform][serviceName].options) : null,
        remark: servicesData[platform][serviceName].remark || null
      }));
    });

    res.json({
      success: true,
      platforms: Object.keys(servicesData),
      services: servicesList,
      totalPlatforms: Object.keys(servicesData).length,
      totalServices: Object.values(servicesData).reduce((sum, platform) => sum + Object.keys(platform).length, 0)
    });
  } catch (err) {
    console.error('❌ Erreur /services:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// INSCRIPTION BACK-END
app.post('/register', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const {
      userId, username, email,
      phone, country,
      referralCode, referralCodeUsed,
      welcomeModalShown, isFirstAccess, openedChests, balance
    } = req.body;

    if (!userId||!username||!email||!phone||!country||!referralCode) {
      return res.status(400).json({ success:false, error:'Champs manquants.' });
    }

    let refUid = null;
    if (referralCodeUsed) {
      const q = await getDB().collection('users')
                      .where('referralCode','==', referralCodeUsed)
                      .limit(1).get();
      if (!q.empty) refUid = q.docs[0].id;
    }

    await getDB().collection('users').doc(userId).set({
      username,
      email,
      phone,
      country,
      referralCode,
      referredBy:       refUid || null,
      balance:          balance !== undefined ? balance : 0,
      referralBalance:  0,
      discountUsesLeft: 10,
      referralsCount:   0,
      createdAt:        admin.firestore.FieldValue.serverTimestamp(),
      
      welcomeModalShown: welcomeModalShown !== undefined ? welcomeModalShown : false,
      isFirstAccess:     isFirstAccess !== undefined ? isFirstAccess : true,
      openedChests:      openedChests || [],

      // --- Section Revendeur ---
      isReseller:           false,
      resellerLevel:        null,
      discountRate:         0,
      resellerSince:        null,
      resellerTotalOrders:  0,
      resellerWeeklyOrders: 0,
      totalSavings:         0,
      resellerRevenue:      0,
      resellerWeeklyRevenue: 0,
      resellerOrdersByDay:  {}
    }, { merge: true });

    res.json({ success:true });
  } catch (err) {
    console.error('❌ Erreur /register:', err);
    res.status(500).json({ success:false, error:err.message });
  }
});

// RÉCUPÉRER LES DONNÉES UTILISATEUR
app.get('/user', authenticateToken, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const userRef = getDB().collection('users').doc(req.userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }

    const userData = userSnap.data();

    // S'assurer que tous les champs revendeur existent
    const resellerData = {
      isReseller: userData.isReseller || false,
      resellerLevel: userData.resellerLevel || null,
      resellerWeeklyOrders: userData.resellerWeeklyOrders || 0,
      resellerTotalOrders: userData.resellerTotalOrders || 0,
      discountRate: userData.discountRate || 0,
      balance: userData.balance || 0,
      totalSavings: userData.totalSavings || 0,
      resellerSince: userData.resellerSince || null
    };

    // Réponse JSON cohérente
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      user: { ...userData, ...resellerData } 
    });

  } catch (err) {
    console.error('❌ Erreur GET /user:', err);
    // Toujours retourner du JSON même en cas d'erreur
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// DEVENIR REVENDEUR
app.post('/become-reseller', authenticateToken, async (req, res) => {
  try {
    if (!getDB()) {
      return res.status(500).json({ 
        success: false, 
        error: 'Base de données non initialisée.' 
      });
    }

    const userRef = getDB().collection('users').doc(req.userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Utilisateur non trouvé.' 
      });
    }

    const userData = userSnap.data();

    // Vérifier si l'utilisateur est déjà revendeur
    if (userData.isReseller) {
      return res.status(400).json({
        success: false,
        error: 'Vous êtes déjà revendeur.'
      });
    }

    // Mise à jour avec toutes les propriétés requises
    await userRef.update({
      isReseller: true,
      resellerLevel: 'beginner',
      discountRate: 5,
      resellerSince: admin.firestore.FieldValue.serverTimestamp(),
      resellerTotalOrders: userData.resellerTotalOrders || 0,
      resellerWeeklyOrders: userData.resellerWeeklyOrders || 0,
      totalSavings: userData.totalSavings || 0,
      resellerRevenue: userData.resellerRevenue || 0,
      resellerWeeklyRevenue: userData.resellerWeeklyRevenue || 0,
      resellerOrdersByDay: userData.resellerOrdersByDay || {}
    });

    // Réponse de succès
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      success: true, 
      message: 'Félicitations, vous êtes maintenant revendeur !',
      level: 'beginner',
      discountRate: 5
    });

  } catch (err) {
    console.error('❌ Erreur /become-reseller:', err);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// DÉMISSIONNER EN TANT QUE REVENDEUR
app.post('/resign', authenticateToken, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const userRef = getDB().collection('users').doc(req.userId);

    await userRef.update({
      isReseller: false,
      resellerLevel: null,
      discountRate: 0,
    });

    res.json({ success: true, message: 'Vous avez démissionné du programme revendeur.' });
  } catch (err) {
    console.error('❌ Erreur /resign:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// MISE À JOUR STATISTIQUES REVENDEUR
app.get('/update-reseller-stats', authenticateToken, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const userRef = getDB().collection('users').doc(req.userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }

    const userData = userSnap.data();

    if (!userData.isReseller) {
      return res.json({ success: true, message: 'Utilisateur non revendeur' });
    }

    const ordersByDay = userData.resellerOrdersByDay || {};
    const today = new Date();
    let weeklyOrders = 0;

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      weeklyOrders += ordersByDay[dateKey] || 0;
    }

    const newLevel = calculateResellerLevel(weeklyOrders);
    const newDiscount = calculateDiscountRate(newLevel);

    await userRef.update({
      resellerWeeklyOrders: weeklyOrders,
      resellerLevel: newLevel,
      discountRate: newDiscount
    });

    res.json({
      success: true,
      weeklyOrders,
      level: newLevel,
      discountRate: newDiscount
    });
  } catch (err) {
    console.error('❌ Erreur /update-reseller-stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ÉVALUATION MANUELLE DES REVENDEURS (pour tests)
app.post('/evaluate-resellers', authenticateToken, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    // Vérifier que l'utilisateur est admin (optionnel - à configurer selon vos besoins)
    const userRef = getDB().collection('users').doc(req.userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }

    // Lancer l'évaluation
    await evaluateAllResellers();

    res.json({
      success: true,
      message: 'Évaluation des revendeurs terminée avec succès'
    });
  } catch (err) {
    console.error('❌ Erreur /evaluate-resellers:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🧪 ROUTE DE TEST - RAPPORT JOURNALIER
app.get('/test-daily-report', async (req, res) => {
  try {
    console.log('🧪 TEST: Déclenchement manuel du rapport journalier...');
    await sendDailyReport();
    res.json({
      success: true,
      message: '✅ Rapport journalier envoyé avec succès ! Vérifiez votre WhatsApp.'
    });
  } catch (err) {
    console.error('❌ Erreur test rapport journalier:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// 🧪 ROUTE DE TEST - RAPPORT MENSUEL
app.get('/test-monthly-report', async (req, res) => {
  try {
    console.log('🧪 TEST: Déclenchement manuel du rapport mensuel...');
    await sendMonthlyReport();
    res.json({
      success: true,
      message: '✅ Rapport mensuel envoyé avec succès ! Vérifiez votre WhatsApp.'
    });
  } catch (err) {
    console.error('❌ Erreur test rapport mensuel:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// 🧪 ROUTE DE TEST - RAPPORT JOURNALIER DES PAIEMENTS
app.get('/test-daily-payment-report', async (req, res) => {
  try {
    console.log('🧪 TEST: Déclenchement manuel du rapport journalier des paiements...');
    await sendDailyPaymentReport();
    res.json({
      success: true,
      message: '✅ Rapport journalier des paiements envoyé avec succès ! Vérifiez votre WhatsApp.'
    });
  } catch (err) {
    console.error('❌ Erreur test rapport journalier paiements:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// 🧪 ROUTE DE TEST - RAPPORT HEBDOMADAIRE DES PAIEMENTS
app.get('/test-weekly-payment-report', async (req, res) => {
  try {
    console.log('🧪 TEST: Déclenchement manuel du rapport hebdomadaire des paiements...');
    await sendWeeklyPaymentReport();
    res.json({
      success: true,
      message: '✅ Rapport hebdomadaire des paiements envoyé avec succès ! Vérifiez votre WhatsApp.'
    });
  } catch (err) {
    console.error('❌ Erreur test rapport hebdomadaire paiements:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// 🧪 ROUTE DE TEST - RAPPORT MENSUEL DES PAIEMENTS
app.get('/test-monthly-payment-report', async (req, res) => {
  try {
    console.log('🧪 TEST: Déclenchement manuel du rapport mensuel des paiements...');
    await sendMonthlyPaymentReport();
    res.json({
      success: true,
      message: '✅ Rapport mensuel des paiements envoyé avec succès ! Vérifiez votre WhatsApp.'
    });
  } catch (err) {
    console.error('❌ Erreur test rapport mensuel paiements:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ─── ESPACE ADMIN — ROUTES SÉCURISÉES (mcexauofficiel@gmail.com uniquement) ──
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'mcexauofficiel@gmail.com';

async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const userRecord = await admin.auth().getUser(decoded.uid);
    if (userRecord.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    req.adminUid = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide: ' + err.message });
  }
}

// Cache mémoire pour les stats admin — évite de relire toutes les collections à chaque rechargement
let _adminStatsCache = { data: null, ts: 0 };
const ADMIN_STATS_TTL = 10 * 60 * 1000; // 10 minutes

// GET /api/admin/stats — statistiques globales
app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    // Servir depuis le cache si moins de 10 minutes — 0 lecture Firestore
    const forceRefresh = req.query.refresh === '1';
    if (!forceRefresh && _adminStatsCache.data && Date.now() - _adminStatsCache.ts < ADMIN_STATS_TTL) {
      return res.json({ ..._adminStatsCache.data, cached: true });
    }

    const db = getDB();
    const todayStart = getStartOfDayWAT();
    const yesterdayStart = getStartOfYesterdayWAT();
    const weekStart = getStartOfWeekWAT();

    // ── Comptages via count() : 1 lecture/collection quelle que soit la taille ──
    const [
      usersTotalSnap, resellerCountSnap,
      commandesCountSnap, autoCountSnap, advCountSnap,
      // Commandes : aujourd'hui / hier / semaine
      cmdTodaySnap, autoTodaySnap, advTodaySnap,
      cmdYestSnap, autoYestSnap, advYestSnap,
      cmdWeekSnap, autoWeekSnap, advWeekSnap,
      // Nouveaux utilisateurs : aujourd'hui / hier / semaine
      usersNewTodaySnap, usersNewYestSnap, usersNewWeekSnap,
      // Recharges reçues (toutes) : aujourd'hui / hier / semaine
      rechargesTodaySnap, rechargesYestSnap, rechargesWeekSnap
    ] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('users').where('isReseller', '==', true).count().get(),
      db.collection('commandes').count().get(),
      db.collection('autoOrders').count().get(),
      db.collection('advancedOrders').count().get(),
      // Aujourd'hui
      db.collection('commandes').where('createdAt', '>=', todayStart).count().get(),
      db.collection('autoOrders').where('createdAt', '>=', todayStart).count().get(),
      db.collection('advancedOrders').where('createdAt', '>=', todayStart).count().get(),
      // Hier
      db.collection('commandes').where('createdAt', '>=', yesterdayStart).where('createdAt', '<', todayStart).count().get(),
      db.collection('autoOrders').where('createdAt', '>=', yesterdayStart).where('createdAt', '<', todayStart).count().get(),
      db.collection('advancedOrders').where('createdAt', '>=', yesterdayStart).where('createdAt', '<', todayStart).count().get(),
      // Cette semaine
      db.collection('commandes').where('createdAt', '>=', weekStart).count().get(),
      db.collection('autoOrders').where('createdAt', '>=', weekStart).count().get(),
      db.collection('advancedOrders').where('createdAt', '>=', weekStart).count().get(),
      // Nouveaux users
      db.collection('users').where('createdAt', '>=', todayStart).count().get(),
      db.collection('users').where('createdAt', '>=', yesterdayStart).where('createdAt', '<', todayStart).count().get(),
      db.collection('users').where('createdAt', '>=', weekStart).count().get(),
      // Recharges reçues
      db.collection('recharges').where('createdAt', '>=', todayStart).count().get(),
      db.collection('recharges').where('createdAt', '>=', yesterdayStart).where('createdAt', '<', todayStart).count().get(),
      db.collection('recharges').where('createdAt', '>=', weekStart).count().get()
    ]);

    const totalUsers      = usersTotalSnap.data().count;
    const resellerCount   = resellerCountSnap.data().count;
    const commandesCount  = commandesCountSnap.data().count;
    const autoOrdersCount = autoCountSnap.data().count;
    const advancedOrdersCount = advCountSnap.data().count;
    const totalOrders     = commandesCount + autoOrdersCount + advancedOrdersCount;

    const ordersToday     = cmdTodaySnap.data().count + autoTodaySnap.data().count + advTodaySnap.data().count;
    const ordersYesterday = cmdYestSnap.data().count  + autoYestSnap.data().count  + advYestSnap.data().count;
    const ordersWeek      = cmdWeekSnap.data().count  + autoWeekSnap.data().count  + advWeekSnap.data().count;

    const newUsersToday     = usersNewTodaySnap.data().count;
    const newUsersYesterday = usersNewYestSnap.data().count;
    const newUsersWeek      = usersNewWeekSnap.data().count;

    const rechargesToday     = rechargesTodaySnap.data().count;
    const rechargesYesterday = rechargesYestSnap.data().count;
    const rechargesWeek      = rechargesWeekSnap.data().count;

    // ── Calcul des évolutions (%) ──
    const evo = (today, yest) => yest === 0 ? (today > 0 ? 100 : 0) : Math.round((today - yest) / yest * 100);
    const ordersEvolution   = evo(ordersToday, ordersYesterday);
    const usersEvolution    = evo(newUsersToday, newUsersYesterday);
    const rechargesEvolution = evo(rechargesToday, rechargesYesterday);

    // ── Revenus et soldes : lecture complète mais mise en cache 10 min ──
    const [usersSnap, rechargesSnap, fapshiSnap, cmdRevSnap, autoRevSnap, advRevSnap] = await Promise.all([
      db.collection('users').select('balance').get(),
      db.collection('recharges').where('status', '==', 'validated').select('amount', 'originalAmount').get(),
      db.collection('fapshiTransactions').where('status', '==', 'SUCCESSFUL').select('amount', 'type').get(),
      db.collection('commandes').select('finalCost', 'totalCost').get(),
      db.collection('autoOrders').select('priceXAF').get(),
      db.collection('advancedOrders').select('priceXAF').get()
    ]);

    const totalBalance = usersSnap.docs.reduce((s, d) => s + (d.data().balance || 0), 0);
    const rechargesRevenue = rechargesSnap.docs.reduce((s, d) => s + (d.data().amount || d.data().originalAmount || 0), 0);
    const fapshiRevenue = fapshiSnap.docs.reduce((s, d) => {
      const data = d.data();
      if (data.type === 'Demande de retrait' || data.type === 'Transfert') return s;
      return s + (data.amount || 0);
    }, 0);
    const ordersRevenue = [
      ...cmdRevSnap.docs.map(d => d.data().finalCost || d.data().totalCost || 0),
      ...autoRevSnap.docs.map(d => d.data().priceXAF || 0),
      ...advRevSnap.docs.map(d => d.data().priceXAF || 0)
    ].reduce((s, v) => s + v, 0);

    const result = {
      totalUsers, resellerCount,
      totalBalance: Math.round(totalBalance),
      totalOrders, todayOrders: ordersToday,
      // Commandes détail
      ordersToday, ordersYesterday, ordersWeek, ordersEvolution,
      // Nouveaux utilisateurs
      newUsersToday, newUsersYesterday, newUsersWeek, usersEvolution,
      // Recharges
      rechargesToday, rechargesYesterday, rechargesWeek, rechargesEvolution,
      // Revenus
      rechargesRevenue: Math.round(rechargesRevenue),
      fapshiRevenue: Math.round(fapshiRevenue),
      totalRechargesRevenue: Math.round(rechargesRevenue + fapshiRevenue),
      ordersRevenue: Math.round(ordersRevenue),
      commandesCount, autoOrdersCount, advancedOrdersCount
    };

    _adminStatsCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — liste utilisateurs avec recherche et tri
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { search = '', sort = 'balance', limit: lim = 50, offset: off = 0 } = req.query;
    const snap = await db.collection('users').limit(300).get();
    let users = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || data.displayName || '',
        email: data.email || '',
        balance: data.balance || 0,
        country: data.country || '',
        isReseller: data.isReseller || false,
        resellerLevel: data.resellerLevel || null,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        photoURL: data.photoURL || null,
        referralCode: data.referralCode || '',
        weeklyOrderCount: data.weeklyOrderCount || 0
      };
    });

    if (search) {
      const s = search.toLowerCase();
      users = users.filter(u =>
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        u.id.toLowerCase().includes(s) ||
        u.country.toLowerCase().includes(s)
      );
    }

    if (sort === 'balance') users.sort((a, b) => b.balance - a.balance);
    else if (sort === 'name') users.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'recent') users.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);

    const total = users.length;
    const page = users.slice(parseInt(off), parseInt(off) + parseInt(lim));
    res.json({ users: page, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/user/:userId — détails d'un utilisateur + ses commandes
app.get('/api/admin/user/:userId', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { userId } = req.params;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const data = userDoc.data();
    const [cmdSnap, autoSnap, advSnap, rechargesSnap] = await Promise.all([
      db.collection('commandes').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(20).get(),
      db.collection('autoOrders').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(20).get(),
      db.collection('advancedOrders').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(20).get(),
      db.collection('recharges').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(10).get()
    ]);

    const formatOrder = (d, col) => {
      const o = d.data();
      return {
        id: d.id,
        collection: col,
        platform: o.platform || '',
        service: o.service || o.serviceName || '',
        quantity: o.quantity || 0,
        cost: o.finalCost || o.totalCost || o.priceXAF || 0,
        status: o.status || 'En attente',
        createdAt: o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate().toISOString() : o.createdAt) : null,
        provider: o.provider || 'exo'
      };
    };

    const orders = [
      ...cmdSnap.docs.map(d => formatOrder(d, 'commandes')),
      ...autoSnap.docs.map(d => formatOrder(d, 'autoOrders')),
      ...advSnap.docs.map(d => formatOrder(d, 'advancedOrders'))
    ].sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1).slice(0, 30);

    const recharges = rechargesSnap.docs.map(d => {
      const r = d.data();
      return {
        id: d.id,
        amount: r.amount || r.originalAmount || 0,
        status: r.status,
        createdAt: r.createdAt ? (r.createdAt.toDate ? r.createdAt.toDate().toISOString() : r.createdAt) : null,
        country: r.country || ''
      };
    });

    res.json({
      user: {
        id: userId,
        name: data.name || data.displayName || '',
        email: data.email || '',
        balance: data.balance || 0,
        country: data.country || '',
        isReseller: data.isReseller || false,
        resellerLevel: data.resellerLevel || null,
        weeklyOrderCount: data.weeklyOrderCount || 0,
        weeklyRevenue: data.weeklyRevenue || 0,
        totalSavings: data.totalSavings || 0,
        referralCode: data.referralCode || '',
        photoURL: data.photoURL || null,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        settings: data.settings || {}
      },
      orders,
      recharges,
      orderCounts: {
        commandes: cmdSnap.size,
        autoOrders: autoSnap.size,
        advancedOrders: advSnap.size,
        total: cmdSnap.size + autoSnap.size + advSnap.size
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/user/:userId/balance — modifier solde
app.post('/api/admin/user/:userId/balance', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { userId } = req.params;
    const { amount, operation, reason } = req.body;
    if (typeof amount !== 'number') return res.status(400).json({ error: 'Montant invalide' });

    const userRef = db.collection('users').doc(userId);
    let newBalance;
    await db.runTransaction(async t => {
      const doc = await t.get(userRef);
      if (!doc.exists) throw new Error('Utilisateur introuvable');
      const current = doc.data().balance || 0;
      if (operation === 'set') newBalance = amount;
      else if (operation === 'add') newBalance = current + amount;
      else if (operation === 'subtract') newBalance = Math.max(0, current - amount);
      else newBalance = amount;
      t.update(userRef, { balance: newBalance });
    });

    console.log(`💼 ADMIN: Solde de ${userId} modifié → ${newBalance} FCFA (${reason || 'Admin'})`);
    res.json({ success: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/user/:userId/update — modifier infos utilisateur
app.post('/api/admin/user/:userId/update', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { userId } = req.params;
    const allowed = ['name', 'country', 'isReseller', 'resellerLevel', 'weeklyOrderCount', 'weeklyRevenue'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune mise à jour valide' });
    await db.collection('users').doc(userId).update(updates);
    res.json({ success: true, updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders — toutes les commandes avec filtres
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { collection: col = 'all', search = '', status = '', limit: lim = 30, offset: off = 0 } = req.query;

    const formatOrder = (d, colName) => {
      const o = d.data();
      return {
        id: d.id,
        collection: colName,
        userId: o.userId || '',
        userName: o.userName || o.userEmail || '',
        platform: o.platform || '',
        service: o.service || o.serviceName || '',
        quantity: o.quantity || 0,
        cost: o.finalCost || o.totalCost || o.priceXAF || 0,
        status: o.status || 'En attente',
        provider: o.provider || (colName === 'commandes' ? 'exo' : colName === 'advancedOrders' ? 'afriqueboost' : 'mtp'),
        createdAt: o.createdAt ? (o.createdAt.toDate ? o.createdAt.toDate().toISOString() : o.createdAt) : null,
        link: o.link || o.url || '',
        isResellerOrder: o.isResellerOrder || false,
        externalOrderId: o.externalOrderId || o.exoOrderId || o.apiOrderId || null
      };
    };

    let orders = [];
    const promises = [];
    if (col === 'all' || col === 'commandes') promises.push(db.collection('commandes').orderBy('createdAt', 'desc').limit(200).get().then(s => orders.push(...s.docs.map(d => formatOrder(d, 'commandes')))));
    if (col === 'all' || col === 'autoOrders') promises.push(db.collection('autoOrders').orderBy('createdAt', 'desc').limit(200).get().then(s => orders.push(...s.docs.map(d => formatOrder(d, 'autoOrders')))));
    if (col === 'all' || col === 'advancedOrders') promises.push(db.collection('advancedOrders').orderBy('createdAt', 'desc').limit(200).get().then(s => orders.push(...s.docs.map(d => formatOrder(d, 'advancedOrders')))));
    await Promise.all(promises);

    orders.sort((a, b) => (b.createdAt || '') > (a.createdAt || '') ? 1 : -1);

    if (status) orders = orders.filter(o => o.status.toLowerCase().includes(status.toLowerCase()));
    if (search) {
      const s = search.toLowerCase();
      orders = orders.filter(o =>
        o.id.toLowerCase().includes(s) ||
        o.userId.toLowerCase().includes(s) ||
        o.service.toLowerCase().includes(s) ||
        o.platform.toLowerCase().includes(s) ||
        o.link.toLowerCase().includes(s)
      );
    }

    const total = orders.length;
    res.json({ orders: orders.slice(parseInt(off), parseInt(off) + parseInt(lim)), total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/order/:col/:orderId — détail d'une commande
app.get('/api/admin/order/:col/:orderId', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { col, orderId } = req.params;
    const validCols = ['commandes', 'autoOrders', 'advancedOrders'];
    if (!validCols.includes(col)) return res.status(400).json({ error: 'Collection invalide' });
    const doc = await db.collection(col).doc(orderId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Commande introuvable' });
    res.json({ id: doc.id, collection: col, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/order/:col/:orderId/status — modifier statut commande
app.post('/api/admin/order/:col/:orderId/status', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { col, orderId } = req.params;
    const { status } = req.body;
    const validCols = ['commandes', 'autoOrders', 'advancedOrders'];
    if (!validCols.includes(col)) return res.status(400).json({ error: 'Collection invalide' });
    if (!status) return res.status(400).json({ error: 'Statut manquant' });
    await db.collection(col).doc(orderId).update({ status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/recharges — toutes les recharges avec filtres
app.get('/api/admin/recharges', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { status = '', limit: lim = 30, offset: off = 0 } = req.query;
    
    let query = db.collection('recharges').orderBy('createdAt', 'desc').limit(300);
    const snap = await query.get();
    let recharges = snap.docs.map(d => {
      const r = d.data();
      return {
        id: d.id,
        userId: r.userId || '',
        username: r.username || r.email || '',
        amount: r.amount || r.originalAmount || 0,
        currency: r.currency || 'XAF',
        country: r.country || '',
        status: r.status || '',
        method: r.method || 'AccountPe',
        createdAt: r.createdAt ? (r.createdAt.toDate ? r.createdAt.toDate().toISOString() : r.createdAt) : null,
        proofUrl: r.proofUrl || null
      };
    });

    if (status) recharges = recharges.filter(r => r.status === status);
    const total = recharges.length;
    res.json({ recharges: recharges.slice(parseInt(off), parseInt(off) + parseInt(lim)), total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/recharge/:rechargeId/validate — valider une recharge manuellement
app.post('/api/admin/recharge/:rechargeId/validate', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { rechargeId } = req.params;
    const rechargeDoc = await db.collection('recharges').doc(rechargeId).get();
    if (!rechargeDoc.exists) return res.status(404).json({ error: 'Recharge introuvable' });
    
    const recharge = rechargeDoc.data();
    if (recharge.status === 'validated') return res.status(400).json({ error: 'Déjà validée' });
    
    const amount = recharge.amount || recharge.originalAmount || 0;
    const userId = recharge.userId;
    
    await db.runTransaction(async t => {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await t.get(userRef);
      const currentBalance = userDoc.exists ? (userDoc.data().balance || 0) : 0;
      t.update(db.collection('recharges').doc(rechargeId), { status: 'validated', validatedAt: admin.firestore.FieldValue.serverTimestamp(), validatedBy: 'admin' });
      t.update(userRef, { balance: currentBalance + amount });
    });
    
    res.json({ success: true, amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/referrals — liste des parrainages
app.get('/api/admin/referrals', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    // Récupérer les utilisateurs qui ont parrainé quelqu'un (referralBalance > 0 ou referredBy renseigné)
    const [referrersSnap, referredsSnap] = await Promise.all([
      db.collection('users').where('referralBalance', '>', 0).select('name', 'email', 'referralBalance', 'referralCode', 'createdAt').limit(100).get(),
      db.collection('users').where('referredBy', '!=', null).select('name', 'email', 'referredBy', 'referralCode', 'createdAt').limit(200).get()
    ]);

    // Construire une map uid → nom du parrain
    const referrers = {};
    referrersSnap.docs.forEach(d => {
      const data = d.data();
      referrers[d.id] = {
        id: d.id,
        name: data.name || data.email || d.id,
        email: data.email || '',
        referralBalance: data.referralBalance || 0,
        referralCode: data.referralCode || '',
        filleuls: []
      };
    });

    // Associer les filleuls à leurs parrains
    const filleuls = referredsSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name || d.data().email || d.id,
      email: d.data().email || '',
      referredBy: d.data().referredBy,
      createdAt: d.data().createdAt ? (d.data().createdAt.toDate ? d.data().createdAt.toDate().toISOString() : d.data().createdAt) : null
    }));

    filleuls.forEach(f => {
      if (f.referredBy && referrers[f.referredBy]) {
        referrers[f.referredBy].filleuls.push(f);
      } else if (f.referredBy) {
        // Parrain sans bonus encore — on l'ajoute quand même
        if (!referrers[f.referredBy]) {
          referrers[f.referredBy] = { id: f.referredBy, name: f.referredBy, email: '', referralBalance: 0, referralCode: '', filleuls: [] };
        }
        referrers[f.referredBy].filleuls.push(f);
      }
    });

    const list = Object.values(referrers).sort((a, b) => b.referralBalance - a.referralBalance);
    const totalReferralBonus = list.reduce((s, r) => s + r.referralBalance, 0);
    const totalFilleuls = filleuls.length;

    res.json({ referrers: list, totalReferralBonus, totalFilleuls, totalReferrers: list.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/withdrawals — demandes de retrait
app.get('/api/admin/withdrawals', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const snap = await db.collection('withdrawalRequests').orderBy('createdAt', 'desc').limit(100).get();
    const withdrawals = snap.docs.map(d => {
      const w = d.data();
      return {
        id: d.id,
        userId: w.userId || '',
        userName: w.userName || w.userEmail || '',
        amount: w.amount || 0,
        method: w.method || '',
        details: w.details || '',
        status: w.status || 'pending',
        createdAt: w.createdAt ? (w.createdAt.toDate ? w.createdAt.toDate().toISOString() : w.createdAt) : null
      };
    });
    res.json({ withdrawals, total: withdrawals.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/withdrawal/:id/status — mettre à jour statut retrait
app.post('/api/admin/withdrawal/:id/status', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { status, note } = req.body;
    const updates = { status, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (note) updates.adminNote = note;
    await db.collection('withdrawalRequests').doc(id).update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📋 ENDPOINT ADMIN - ENVOYER TOUTES LES COMMANDES MANUELLES EXISTANTES SUR WHATSAPP
app.get('/admin/send-manual-orders', async (req, res) => {
  try {
    console.log('📋 Récupération des commandes manuelles existantes...');
    
    if (!getDB()) {
      return res.status(500).json({ success: false, error: 'Base de données non initialisée' });
    }
    
    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      return res.status(500).json({ success: false, error: 'Configuration Twilio incomplète' });
    }
    
    // Récupérer toutes les commandes qui ne sont pas automatisées (pas de exoOrderId)
    // et qui sont en attente ou en cours
    // Note: On récupère d'abord sans orderBy pour éviter les index composites
    const commandesSnapshot = await getDB().collection('commandes')
      .where('status', 'in', ['En attente', 'en cours'])
      .get();
    
    const manualOrders = [];
    
    commandesSnapshot.forEach(doc => {
      const data = doc.data();
      // Une commande est manuelle si elle n'a pas d'exoOrderId OU si isAutoOrder est false
      if (!data.exoOrderId || data.isAutoOrder === false) {
        manualOrders.push({
          id: doc.id,
          ...data
        });
      }
    });
    
    // Trier par date de création (plus récent en premier)
    manualOrders.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });
    
    if (manualOrders.length === 0) {
      return res.json({
        success: true,
        message: '✅ Aucune commande manuelle en attente trouvée.',
        count: 0
      });
    }
    
    console.log(`📋 ${manualOrders.length} commandes manuelles trouvées`);
    
    // Construire un message récapitulatif
    let message = `🔴 *RÉCAPITULATIF COMMANDES MANUELLES*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📊 ${manualOrders.length} commandes à traiter\n\n`;
    
    for (let i = 0; i < manualOrders.length; i++) {
      const order = manualOrders[i];
      const createdAt = order.createdAt?.toDate?.() || new Date();
      
      message += `*${i + 1}. ${order.orderId || order.id}*\n`;
      message += `├─ 📅 ${createdAt.toLocaleString('fr-FR')}\n`;
      message += `├─ 📱 ${order.platform || 'N/A'}\n`;
      message += `├─ 🎯 ${order.service || 'N/A'}\n`;
      message += `├─ ⭐ ${order.quality || 'N/A'}\n`;
      message += `├─ 📊 Qté: ${order.quantity || 0}\n`;
      message += `├─ 💰 ${(order.finalCost || 0).toLocaleString('fr-FR')} FCFA\n`;
      message += `├─ 🔗 ${(order.link || 'N/A').substring(0, 50)}${(order.link?.length > 50) ? '...' : ''}\n`;
      message += `└─ 📞 ${order.contact || 'N/A'}\n\n`;
      
      // Limiter la taille du message WhatsApp (max ~1600 caractères)
      if (message.length > 1400 && i < manualOrders.length - 1) {
        message += `... et ${manualOrders.length - i - 1} autres commandes\n`;
        break;
      }
    }
    
    message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    message += `⏰ ${new Date().toLocaleString('fr-FR')}\n`;
    message += `🔔 Social Boost Horizon`;
    
    await clientTwilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
    });
    
    console.log(`✅ Récapitulatif de ${manualOrders.length} commandes manuelles envoyé sur WhatsApp`);
    
    res.json({
      success: true,
      message: `✅ ${manualOrders.length} commandes manuelles envoyées sur WhatsApp`,
      count: manualOrders.length,
      orders: manualOrders.map(o => ({
        orderId: o.orderId || o.id,
        platform: o.platform,
        service: o.service,
        quantity: o.quantity,
        status: o.status
      }))
    });
    
  } catch (err) {
    console.error('❌ Erreur envoi commandes manuelles:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// 📦 ROUTE - RÉCAPITULATIF DES COMMANDES VIA WHATSAPP
// Usage: /send-orders-summary?fromId=1097&limit=10
app.get('/send-orders-summary', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });

    const fromId = parseInt(req.query.fromId || '0');
    const limit = parseInt(req.query.limit || '10');

    console.log(`📦 Envoi récapitulatif des commandes depuis ID ${fromId} (limite: ${limit})...`);

    // Récupérer toutes les commandes
    const allOrders = await getDB().collection('commandes')
      .orderBy('createdAt', 'desc')
      .get();

    // Filtrer les commandes avec ID >= fromId
    const filteredOrders = [];
    allOrders.forEach((doc) => {
      const order = doc.data();
      const orderId = parseInt(order.orderId || order.id || '0');
      
      if (orderId >= fromId) {
        filteredOrders.push({
          firestoreId: doc.id,
          orderId: orderId,
          ...order
        });
      }
    });

    // Trier par orderId et limiter
    filteredOrders.sort((a, b) => a.orderId - b.orderId);
    const ordersToSend = filteredOrders.slice(0, limit);

    if (ordersToSend.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Aucune commande trouvée avec ID >= ${fromId}`
      });
    }

    // Vérifier configuration Twilio
    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      return res.status(500).json({
        success: false,
        error: 'Configuration Twilio manquante'
      });
    }

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    // Envoyer chaque commande
    for (const order of ordersToSend) {
      try {
        const createdAt = order.createdAt?.toDate ? order.createdAt.toDate() : new Date();
        
        // Récupérer les infos utilisateur
        let username = 'N/A';
        let userInfo = null;
        let orderUserCountry = 'CM';
        try {
          const userSnap = await getDB().collection('users').doc(order.userId).get();
          if (userSnap.exists) {
            userInfo = userSnap.data();
            username = userInfo.username || 'N/A';
            orderUserCountry = userInfo.country || userInfo.pays || 'CM';
          }
        } catch (e) {
          console.warn(`⚠️  Impossible de récupérer l'utilisateur ${order.userId}`);
        }
        
        const orderCurrencyConfig = CURRENCY_CONFIG[orderUserCountry] || CURRENCY_CONFIG['CM'];

        // Construire le message (même format que les notifications de commande)
        const lines = [
          '📣 Nouvelle commande',
          `• ID Commande : ${order.orderId}`,
          `• Client : ${username} (${order.userId})`,
          `• Pays : ${orderCurrencyConfig.name} (${orderUserCountry})`,
          `• Date : ${createdAt.toLocaleString('fr-FR')}`,
          `• Plateforme : ${order.platform}`,
          `• Service : ${order.serviceType || 'N/A'}${order.subOption ? ` → ${order.subOption}` : ''}`,
          `• Qualité : ${order.quality || 'N/A'}`,
          `• Quantité : ${order.quantity || 'N/A'}`,
          `• Montant (HT): ${formatDualCurrency(order.normalPrice || order.finalCost || 0, orderUserCountry)}`,
          `• Remise : ${order.discountRate || 0}%`,
          `⚡ Mode Vitesse : ${order.speedMode ? `OUI (+${formatDualCurrency(order.speedModeCharge || 0, orderUserCountry)} soit +10%)` : 'NON'}`,
          `• Montant Final: ${formatDualCurrency(order.finalCost || order.cost || 0, orderUserCountry)}`,
          `• Solde Restant: ${formatDualCurrency(order.balanceAfter || 0, orderUserCountry)}`,
          `• Lien : ${order.targetLink || order.link || 'N/A'}`,
          `• Contact : ${order.contactType || 'N/A'} - ${order.contact || 'N/A'}`
        ];

        // Ajouter les infos revendeur si applicable
        if (userInfo && userInfo.isReseller) {
          lines.push('--- Infos Revendeur ---');
          lines.push(`• Commandes (Total) : ${userInfo.resellerTotalOrders || 0}`);
          lines.push(`• Commandes (Semaine): ${userInfo.resellerWeeklyOrders || 0}`);
          lines.push(`• Total ventes (HT) : ${formatDualCurrency(userInfo.resellerRevenue || 0, orderUserCountry)}`);
          lines.push(`• Total économies : ${formatDualCurrency(userInfo.totalSavings || 0, orderUserCountry)}`);
        }

        // Ajouter les commentaires si disponibles
        if (Array.isArray(order.comments) && order.comments.length > 0) {
          lines.push('• Commentaires :');
          order.comments.forEach((c, idx) => lines.push(`${idx + 1}. ${c.trim()}`));
        }

        // Envoyer via Twilio WhatsApp
        await clientTwilio.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
          body: lines.join('\n')
        });

        successCount++;
        console.log(`✅ Commande #${order.orderId} envoyée avec succès`);
        
        // Pause de 2 secondes entre chaque message pour éviter les rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (sendErr) {
        failCount++;
        const errorMsg = `Commande #${order.orderId}: ${sendErr.message || sendErr}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    res.json({
      success: true,
      message: `Récapitulatif envoyé : ${successCount}/${ordersToSend.length} commandes`,
      details: {
        fromId: fromId,
        requested: limit,
        found: filteredOrders.length,
        sent: ordersToSend.length,
        successCount: successCount,
        failCount: failCount,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (err) {
    console.error('❌ Erreur /send-orders-summary:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ─── ENDPOINTS ACCOUNTPE (Paiement automatique) ─────────────────────────────

// Créer un lien de paiement AccountPe
app.post('/create-payment', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });
    
    const { email, userId, username, country, phone, amount } = req.body;
    
    if (!email || !amount) {
      return res.status(400).json({ success: false, error: 'Email et montant requis.' });
    }
    
    const paymentAmount = parseInt(amount);
    if (paymentAmount < 500 || paymentAmount > 1000000) {
      return res.status(400).json({ success: false, error: 'Montant invalide (500 - 1,000,000 FCFA).' });
    }
    
    const token = await getAccountPeToken();
    const transactionId = `SBH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await fetch(`${ACCOUNTPE_CONFIG.baseUrl}/create_payment_links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        country_code: country || 'CM',
        name: username || email.split('@')[0],
        email: email,
        mobile: phone || '',
        amount: paymentAmount,
        currency: ACCOUNTPE_CONFIG.currency,
        transaction_id: transactionId,
        description: `Recharge Social Boost Horizon - ${paymentAmount} FCFA`,
        pass_digital_charge: true,
        callback_url: `https://social-boost-exaucenapopolo2.replit.app/webhooks/accountpe`,
        return_url: `${ACCOUNTPE_CONFIG.returnUrl}?txid=${transactionId}`
      })
    });
    
    const data = await response.json();
    console.log('📤 AccountPe create_payment response:', JSON.stringify(data));
    
    const paymentLink = data.data?.payment_link || data.payment_link;
    
    if (!paymentLink) {
      console.error('❌ AccountPe: Pas de lien de paiement reçu:', data);
      return res.status(500).json({ success: false, error: 'Erreur création paiement.' });
    }
    
    await getDB().collection('payments').doc(transactionId).set({
      transactionId,
      userId: userId || null,
      email,
      username: username || email.split('@')[0],
      amount: paymentAmount,
      country: country || 'CM',
      phone: phone || '',
      status: 'created',
      paymentLink,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Paiement créé: ${transactionId} - ${paymentAmount} FCFA pour ${email}`);
    
    // NOTE: Pas de notification WhatsApp pour les paiements en attente
    // La notification sera envoyée uniquement quand le paiement sera confirmé (dans processSuccessfulPayment)
    
    res.json({ 
      success: true, 
      transactionId, 
      checkoutUrl: paymentLink,
      amount: paymentAmount
    });
    
  } catch (err) {
    console.error('❌ Erreur /create-payment:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vérifier le statut d'un paiement
app.get('/confirm/:transactionId', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });
    
    const { transactionId } = req.params;
    
    const paymentDoc = await getDB().collection('payments').doc(transactionId).get();
    if (!paymentDoc.exists) {
      return res.status(404).json({ success: false, error: 'Transaction non trouvée.' });
    }
    
    const paymentData = paymentDoc.data();
    
    if (paymentData.status === 'paid' && paymentData.processed) {
      return res.json({ success: true, transactionId, isPaid: true, status: 'paid' });
    }
    
    const token = await getAccountPeToken();
    
    const response = await fetch(`${ACCOUNTPE_CONFIG.baseUrl}/payment_link_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ transaction_id: transactionId })
    });
    
    const data = await response.json();
    console.log('📥 AccountPe status response:', JSON.stringify(data));
    
    const rawStatus = data.data?.data?.attributes?.status ?? data.status;
    const isPaid = rawStatus === 1 || rawStatus === 'success' || rawStatus === 'paid';
    
    if (isPaid && !paymentData.processed) {
      await processSuccessfulPayment(transactionId);
    }
    
    res.json({ 
      success: true, 
      transactionId, 
      isPaid,
      status: isPaid ? 'paid' : 'pending'
    });
    
  } catch (err) {
    console.error('❌ Erreur /confirm:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook AccountPe (notification automatique)
app.post('/webhooks/accountpe', async (req, res) => {
  console.log('📨 Webhook AccountPe reçu:', JSON.stringify(req.body));
  
  res.status(200).json({ received: true });
  
  try {
    const transactionId = req.body.transaction_id || req.body.transactionId;
    
    if (!transactionId) {
      console.warn('⚠️ Webhook sans transaction_id');
      return;
    }
    
    const token = await getAccountPeToken();
    const verifyResponse = await fetch(`${ACCOUNTPE_CONFIG.baseUrl}/payment_link_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ transaction_id: transactionId })
    });
    
    const verifyData = await verifyResponse.json();
    console.log('📥 Vérification webhook:', JSON.stringify(verifyData));
    
    const rawStatus = verifyData.data?.data?.attributes?.status ?? verifyData.status;
    const isPaid = rawStatus === 1 || rawStatus === 'success' || rawStatus === 'paid';
    
    if (isPaid) {
      await processSuccessfulPayment(transactionId);
    }
    
  } catch (err) {
    console.error('❌ Erreur webhook AccountPe:', err);
  }
});

// Fonction pour traiter un paiement réussi
async function processSuccessfulPayment(transactionId) {
  try {
    const paymentDoc = await getDB().collection('payments').doc(transactionId).get();
    
    if (!paymentDoc.exists) {
      console.warn(`⚠️ Payment ${transactionId} non trouvé en base`);
      return;
    }
    
    const paymentData = paymentDoc.data();
    
    if (paymentData.processed) {
      console.log(`ℹ️ Payment ${transactionId} déjà traité`);
      return;
    }
    
    const userEmail = paymentData.email;
    const originalAmount = paymentData.amount;
    const userId = paymentData.userId;
    const country = paymentData.country || 'CM';
    
    // Convertir le montant payé vers XAF (devise de base de la plateforme)
    const amountXAF = convertToXAF(originalAmount, country);
    const currencyConfig = CURRENCY_CONFIG[country] || CURRENCY_CONFIG['CM'];
    
    console.log(`💳 Paiement reçu: ${originalAmount} ${currencyConfig.currency} (${country}) → ${amountXAF} XAF`);
    
    let userRef = null;
    let userData = null;
    
    if (userId) {
      userRef = getDB().collection('users').doc(userId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        userData = userDoc.data();
      }
    }
    
    if (!userRef || !userData) {
      const usersQuery = await getDB().collection('users').where('email', '==', userEmail).limit(1).get();
      if (!usersQuery.empty) {
        userRef = usersQuery.docs[0].ref;
        userData = usersQuery.docs[0].data();
      }
    }
    
    if (!userRef || !userData) {
      console.error(`❌ Utilisateur non trouvé pour ${userEmail}`);
      await getDB().collection('payments').doc(transactionId).update({
        status: 'paid',
        error: 'Utilisateur non trouvé',
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }
    
    const currentBalance = userData.balance || 0;
    const newBalance = currentBalance + amountXAF;
    
    await userRef.update({
      balance: newBalance
    });
    
    await getDB().collection('recharges').add({
      userId: userRef.id,
      email: userEmail,
      originalAmount: originalAmount,
      originalCurrency: currencyConfig.currency,
      country: country,
      amount: amountXAF,
      method: 'AccountPe',
      transactionId: transactionId,
      status: 'validated',
      previousBalance: currentBalance,
      newBalance: newBalance,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    await getDB().collection('payments').doc(transactionId).update({
      status: 'paid',
      processed: true,
      amountXAF: amountXAF,
      paidAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ PAIEMENT TRAITÉ: ${userEmail} +${amountXAF} XAF (${originalAmount} ${currencyConfig.currency}) | Solde: ${currentBalance} → ${newBalance}`);
    
    if (userData.referredBy) {
      try {
        const referrerRef = getDB().collection('users').doc(userData.referredBy);
        const referrerDoc = await referrerRef.get();
        if (referrerDoc.exists) {
          const referralBonus = Math.floor(amountXAF * 0.05);
          const currentReferralBalance = referrerDoc.data().referralBalance || 0;
          await referrerRef.update({
            referralBalance: currentReferralBalance + referralBonus
          });
          console.log(`💰 Bonus parrainage: +${referralBonus} FCFA pour ${referrerDoc.data().email}`);
        }
      } catch (refErr) {
        console.error('Erreur bonus parrainage:', refErr);
      }
    }
    
    if (clientTwilio && ADMIN_WHATSAPP_NUMBER) {
      try {
        const now = new Date();
        const dateStr = now.toLocaleString('fr-FR', { timeZone: 'Africa/Douala' });
        
        const conversionNote = country !== 'CM' && currencyConfig.rate !== 1 
          ? `\n💱 Conversion: ${originalAmount.toLocaleString('fr-FR')} ${currencyConfig.currency} → ${amountXAF.toLocaleString('fr-FR')} XAF` 
          : '';
        
        await clientTwilio.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
          body: `✅ *PAIEMENT CONFIRMÉ - COMPTE MIS À JOUR*\n\n` +
                `📅 ${dateStr}\n` +
                `👤 ${userData.username || userEmail}\n` +
                `📧 ${userEmail}\n` +
                `📱 ${userData.phone || 'Non renseigné'}\n` +
                `🌍 Pays: ${currencyConfig.name} (${country})\n\n` +
                `💵 *Montant payé: ${originalAmount.toLocaleString('fr-FR')} ${currencyConfig.currency}*${conversionNote}\n` +
                `💵 *Crédité: +${amountXAF.toLocaleString('fr-FR')} XAF*\n` +
                `💰 Ancien solde: ${currentBalance.toLocaleString('fr-FR')} XAF\n` +
                `💳 *Nouveau solde: ${newBalance.toLocaleString('fr-FR')} XAF*\n\n` +
                `🔗 Transaction: ${transactionId}\n\n` +
                `✅ *Statut: COMPTE MIS À JOUR AUTOMATIQUEMENT*`
        });
        console.log(`📱 Notification WhatsApp envoyée: Paiement confirmé ${transactionId}`);
      } catch (twilioErr) {
        console.warn('Notification WhatsApp échouée (paiement confirmé):', twilioErr.message);
      }
    }
    
  } catch (err) {
    console.error('❌ Erreur processSuccessfulPayment:', err);
  }
}

// UPLOAD PREUVE (accepte userId ou utilise token si présent)
app.post('/upload', upload.single('proof'), async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    // Permettre soit token auth, soit userId dans form-data
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.userId = decoded.uid;
      } catch (e) {
        console.warn('Upload: token invalide ou absent, on essaie userId en body');
      }
    }

    const userId = req.userId || req.body.userId || req.query.userId;
    if (!userId) return res.status(400).json({ success:false, error:'User ID manquant.' });

    const { provider } = req.body;
    if (!provider || !req.file) {
      return res.status(400).json({ success:false, error:'Champs manquants.' });
    }

    const buffer = fs.readFileSync(path.join(UPLOAD_DIR, req.file.filename));
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const proofRef = getDB().collection('proofs').doc(hash);
    if ((await proofRef.get()).exists) {
      return res.status(400).json({ success:false, error:'Preuve déjà utilisée.' });
    }

    const text = await extraireTexte(path.join(UPLOAD_DIR, req.file.filename));
    const payeeMatch = text.match(/vers\s+(\d{6,15})/i);
    if (!payeeMatch || !allowedRecipients.includes(payeeMatch[1])) {
      return res.status(400).json({ success:false, error:'Destinataire non autorisé.' });
    }

    const montant = await extraireMontantFCFA(text);

    await getDB().collection('users').doc(userId).set({
      balance: admin.firestore.FieldValue.increment(montant),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }, { merge:true });

    const filleulDoc = await getDB().collection('users').doc(userId).get();
    const refBy = filleulDoc.data()?.referredBy;
    if (refBy) {
      const share = Math.floor(montant * 0.05);
      const refUserRef = getDB().collection('users').doc(refBy);

      await refUserRef.set({ referralBalance: admin.firestore.FieldValue.increment(share) }, { merge:true });
      await refUserRef.set({ referralsCount: admin.firestore.FieldValue.increment(1) }, { merge:true });

      await refUserRef.collection('referrals').add({
        refereeUid: userId,
        amount: montant,
        date: admin.firestore.FieldValue.serverTimestamp(),
        referrerShare: share,
        status: 'completed'
      });

      const phoneRaw = (await refUserRef.get()).data()?.phone;
      if (phoneRaw && clientTwilio && TWILIO_WHATSAPP_NUMBER && ADMIN_WHATSAPP_NUMBER) {
        try {
          await clientTwilio.messages.create({
            from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
            to: `whatsapp:${toE164(phoneRaw)}`,
            body:`🎉 Vous avez reçu ${share} FCFA de cashback !`
          });
        } catch (twErr) {
          console.warn('Twilio notify referrer failed:', twErr && twErr.message ? twErr.message : twErr);
        }
      }
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    await proofRef.set({
      userId, provider, fileUrl, montant,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (clientTwilio && TWILIO_WHATSAPP_NUMBER && ADMIN_WHATSAPP_NUMBER) {
      try {
        await clientTwilio.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
          body:[
            '✅ Nouvelle preuve reçue',
            `• UserID : ${userId}`,
            `• Provider : ${provider}`,
            `• Destin. : ${payeeMatch[1]}`,
            `• Montant : ${montant} FCFA`,
            `• Lien : ${fileUrl}`
          ].join('\n')
        });
      } catch (twErr) {
        console.warn('Twilio admin notify failed:', twErr && twErr.message ? twErr.message : twErr);
      }
    }

    res.json({ success:true, montant });
  } catch (err) {
    console.error('❌ Erreur /upload:', err);
    res.status(500).json({ success:false, error:err.message });
  }
});

// COMMANDER UN BOOST
app.post('/order', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    // Autoriser token ou userId direct
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(token);
        req.userId = decoded.uid;
      } catch (e) {
        // si token invalide, on laisse tomber et on essaie userId dans le body (validateUser below)
      }
    }
    const userId = req.userId || req.body.userId || req.query.userId;
    if (!userId) return res.status(400).json({ success:false, error:'User ID manquant.' });
    req.userId = userId;

    console.log('📦 Commande reçue:', JSON.stringify(req.body, null, 2));

    let {
      platform, service, quality = 'medium', subOption,
      link, quantity, comments,
      contactType, contact,
      currentQuantity, estimatedQuantity
    } = req.body;
    
    // Normaliser isResellerOrder en booléen (true/false/'true'/'false' → boolean)
    const isResellerOrder = req.body.isResellerOrder === true || req.body.isResellerOrder === 'true';
    console.log(`🔍 isResellerOrder RAW: ${req.body.isResellerOrder} (type: ${typeof req.body.isResellerOrder}), NORMALISÉ: ${isResellerOrder}`);
    
    // Normaliser speedMode en booléen
    const speedMode = req.body.speedMode === true || req.body.speedMode === 'true';
    console.log(`⚡ speedMode RAW: ${req.body.speedMode} (type: ${typeof req.body.speedMode}), NORMALISÉ: ${speedMode}`);

    // Normaliser le nom du service reçu avec le mapping de compatibilité
    const originalService = service;
    const originalSubOption = subOption;
    service = normalizeServiceName(service, platform);
    subOption = normalizeServiceName(subOption, platform);
    console.log(`🔄 Normalisation: service "${originalService}" → "${service}", subOption "${originalSubOption}" → "${subOption}"`);

    // Vérifier si la plateforme existe
    if (!servicesData[platform]) {
      console.error('❌ Plateforme inconnue:', { platform, service: originalService });
      return res.status(400).json({ 
        success: false, 
        error: `Plateforme "${platform}" inconnue.`,
        availablePlatforms: Object.keys(servicesData)
      });
    }

    // Essayer de trouver le service (exactement ou normalisé)
    let serviceDef = servicesData[platform][service];
    let foundAsSubOption = false;
    
    if (!serviceDef) {
      // Si pas trouvé, essayer avec les noms normalisés
      const platformServices = servicesData[platform];
      const normalizedServices = {};
      Object.keys(platformServices).forEach(key => {
        normalizedServices[normalizeServiceName(key)] = key;
      });
      
      if (normalizedServices[service]) {
        const correctServiceName = normalizedServices[service];
        serviceDef = servicesData[platform][correctServiceName];
        console.log(`✅ Service trouvé après normalisation: "${originalService}" → "${correctServiceName}"`);
        service = correctServiceName; // Utiliser le nom correct
      }
    }
    
    // Si toujours pas trouvé, chercher dans les sous-options de tous les services de cette plateforme
    if (!serviceDef) {
      console.log(`🔍 Recherche dans les sous-options pour: "${service}"`);
      const platformServices = servicesData[platform];
      const normalizedSearchService = normalizeServiceName(service);
      
      for (const [serviceName, serviceData] of Object.entries(platformServices)) {
        if (serviceData.options) {
          for (const optionKey of Object.keys(serviceData.options)) {
            const normalizedOptionKey = normalizeServiceName(optionKey);
            if (normalizedOptionKey === normalizedSearchService || optionKey === service) {
              console.log(`✅ Service trouvé comme sous-option: "${originalService}" → parent: "${serviceName}", subOption: "${optionKey}"`);
              serviceDef = serviceData;
              service = serviceName;
              subOption = optionKey;
              foundAsSubOption = true;
              break;
            }
          }
          if (foundAsSubOption) break;
        }
      }
    }

    if (!serviceDef) {
      console.error('❌ Service inconnu:', { 
        platform, 
        serviceOriginal: originalService,
        serviceNormalized: service,
        availableServices: Object.keys(servicesData[platform])
      });
      return res.status(400).json({ 
        success: false, 
        error: `Service "${originalService}" inconnu pour la plateforme "${platform}".`,
        availableServices: Object.keys(servicesData[platform])
      });
    }
    let minQty = 1;
    if (serviceDef.remark) {
      const m = serviceDef.remark.match(/\(min:\s*(\d+)\)/);
      if (m) minQty = parseInt(m[1], 10);
    }

    function computeNormalPrice() {
      const servicesWithFixedQuantityInOptions = [
        "Vues publication spécifique", "Vues des publications précédentes",
        "Vues futures publications", "Réactions précédentes", "Réactions futures"
      ];
      let normalPrice = 0;
      let unitPrice = 0;
      let finalTime = 'N/A';

      if (serviceDef.options) {
        // Chercher la sous-option avec normalisation
        let foundSubOption = subOption;
        let optionData = serviceDef.options[subOption];
        
        if (!optionData && subOption) {
          // Essayer de trouver avec normalisation
          const normalizedOptions = {};
          Object.keys(serviceDef.options).forEach(key => {
            normalizedOptions[normalizeServiceName(key)] = key;
          });
          
          if (normalizedOptions[subOption]) {
            foundSubOption = normalizedOptions[subOption];
            optionData = serviceDef.options[foundSubOption];
            console.log(`✅ SubOption trouvée après normalisation: "${originalSubOption}" → "${foundSubOption}"`);
          }
        }
        
        if (!subOption || !optionData) {
          console.error('❌ Sous-option invalide:', { 
            subOption: originalSubOption, 
            subOptionNormalized: subOption,
            availableOptions: Object.keys(serviceDef.options)
          });
          throw new Error(`Sous-option "${originalSubOption || 'non spécifiée'}" invalide. Options disponibles: ${Object.keys(serviceDef.options).join(', ')}`);
        }
        
        // Mettre à jour subOption avec le nom correct pour le stockage
        subOption = foundSubOption;
        const opt = optionData[quality] || optionData.medium;
        finalTime = opt.time;
        const isQuantityFixedByOption = servicesWithFixedQuantityInOptions.includes(service) && platform === 'telegram';

        if (isQuantityFixedByOption) {
          normalPrice = Number(opt.price) || 0;
          unitPrice = normalPrice;
        } else {
          if (Array.isArray(comments) && comments.length > 0) {
            unitPrice = Number(opt.price) / 10;
            normalPrice = (Number(opt.price) / 10) * comments.length;
          } else if (quantity && Number(quantity) > 0) {
            unitPrice = Number(opt.price);
            normalPrice = (Number(opt.price) / 1000) * Number(quantity);
          } else {
            normalPrice = Number(opt.price) || 0;
            unitPrice = normalPrice;
          }
        }
      } else {
        const cfg = serviceDef[quality] || serviceDef.medium;
        finalTime = cfg.time;
        const isCommentService = normalizeServiceName(service).toLowerCase().includes('commentaires personnalises');
        if (isCommentService) {
          const linesCount = Array.isArray(comments) ? comments.length : (typeof comments === 'string' ? comments.split('\n').filter(l => l.trim()).length : 0);
          unitPrice = Number(cfg.price) / 10;
          normalPrice = (Number(cfg.price) / 10) * linesCount;
        } else {
          unitPrice = Number(cfg.price) / 1000;
          normalPrice = (Number(cfg.price) / 1000) * (Number(quantity) || 0);
        }
      }

      if (Array.isArray(comments) && comments.length > 0) {
        if (comments.length < minQty) throw new Error(`Au moins ${minQty} commentaires requis.`);
      } else if (!serviceDef.options) {
        if ((Number(quantity) || 0) < minQty) throw new Error(`La quantité minimale est de ${minQty}.`);
      } else {
        if ((Number(quantity) || 0) > 0 && (Number(quantity) < minQty)) throw new Error(`La quantité minimale est de ${minQty}.`);
      }

      normalPrice = Math.round(Number(normalPrice) || 0);
      
      // CONVERSION AUTOMATIQUE EN MINUTES pour éviter les erreurs de parsing
      const finalTimeInMinutes = convertTimeToMinutes(finalTime);
      console.log(`🔄 Conversion temps: "${finalTime}" → "${finalTimeInMinutes}"`);
      
      return { normalPrice, unitPrice, finalTime: finalTimeInMinutes };
    }

    let computed;
    try {
      computed = computeNormalPrice();
    } catch (piErr) {
      console.error('❌ Erreur calcul prix:', piErr.message);
      return res.status(400).json({ success:false, error: piErr.message });
    }
    const normalPrice = computed.normalPrice;

    const userRef = getDB().collection('users').doc(req.userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ success:false, error:'Utilisateur introuvable.' });
    const userData = userSnap.data() || {};

    console.log('🔍 DEBUG - Données utilisateur:', {
      isReseller: userData.isReseller,
      discountRate: userData.discountRate,
      resellerLevel: userData.resellerLevel,
      isResellerOrder: isResellerOrder
    });

    let effectiveDiscountRate = 0;
    if (isResellerOrder && userData.isReseller) {
      effectiveDiscountRate = Number(userData.discountRate) || 0;
      console.log(`✅ Commande revendeur - Prix normal: ${normalPrice} FCFA, Réduction: ${effectiveDiscountRate}%`);
    } else {
      console.log(`📦 Commande normale - isResellerOrder: ${isResellerOrder}, isReseller: ${userData.isReseller}`);
    }
    const discountedPrice = Math.round(normalPrice * (1 - (effectiveDiscountRate / 100)));
    
    // Calcul du Mode Vitesse (ajouter 10% au prix après réduction)
    let speedModeCharge = 0;
    let baseCost = discountedPrice;
    if (speedMode) {
      speedModeCharge = Math.round(baseCost * 0.10); // 10% du prix après réduction
      console.log(`⚡ Mode Vitesse activé - Frais supplémentaires: ${speedModeCharge} FCFA (10% de ${baseCost} FCFA)`);
    }
    
    const finalCost = Math.round(baseCost + speedModeCharge);

    if (!Number.isFinite(finalCost) || isNaN(finalCost) || finalCost < 0) {
      console.error('❌ Montant invalide calculé:', finalCost);
      return res.status(400).json({ success:false, error:`Montant invalide calculé (${String(finalCost)}).` });
    }

    const orderId = await getNextOrderId();

    // Transaction: créer commande et débiter l'user
    let newBalanceAfter = null;
    const orderDocRef = getDB().collection('commandes').doc();
    await getDB().runTransaction(async (tx) => {
      const freshUserSnap = await tx.get(userRef);
      if (!freshUserSnap.exists) throw new Error('Utilisateur introuvable (transaction).');
      const freshUser = freshUserSnap.data() || {};
      const currentBalance = Number(freshUser.balance || 0);

      if (!Number.isFinite(currentBalance)) throw new Error('Solde utilisateur invalide.');
      if (currentBalance < finalCost) throw new Error('Solde insuffisant.');

      const orderData = {
        orderId,
        userId: req.userId,
        platform,
        service,
        quality,
        quantity: Array.isArray(comments) ? comments.length : (quantity ? Number(quantity) : 0),
        totalCost: normalPrice,
        finalCost: finalCost,
        discountRateApplied: effectiveDiscountRate,
        speedMode: speedMode || false,  // Mode Vitesse activé ou non
        speedModeCharge: speedModeCharge || 0,  // Montant des frais de vitesse (10%)
        link: link || null,
        time: computed.finalTime,  // Temps CONVERTI EN MINUTES automatiquement
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'En attente',
        contactType: contactType || null,
        contact: contact || null,
        resellerLevel: freshUser.resellerLevel || null,
        isResellerOrder: isResellerOrder || false,  // Distingue les commandes revendeur vs normales
        currentQuantity: currentQuantity !== null && currentQuantity !== undefined ? Number(currentQuantity) : null,  // Quantité actuelle (optionnel, peut être 0)
        estimatedQuantity: estimatedQuantity !== null && estimatedQuantity !== undefined ? Number(estimatedQuantity) : null  // Quantité estimée après commande (optionnel, peut être 0)
      };
      if (subOption) orderData.subOption = subOption;
      if (Array.isArray(comments) && comments.length) orderData.comments = comments;

      tx.set(orderDocRef, orderData);
      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-finalCost),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });

      newBalanceAfter = currentBalance - finalCost;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // INTÉGRATION EXOSUPPLIER - Vérifier si le service peut être automatisé
    // ═══════════════════════════════════════════════════════════════════════════
    let isExoOrder = false;
    let exoOrderId = null;
    const exoServiceId = findExoSupplierService(platform, service, quality, subOption);
    
    if (exoServiceId) {
      console.log(`🔄 Service mappé ExoSupplier: ${platform}|${service}|${quality} → ID ${exoServiceId}`);
      
      try {
        // Récupérer les infos du service ExoSupplier
        const exoServices = await getExoSupplierServices();
        const exoService = exoServices.find(s => s.service === exoServiceId || s.service === String(exoServiceId));
        
        if (exoService) {
          // Préparer les paramètres de commande
          const exoParams = {
            action: 'add',
            service: exoServiceId,
            link: link,
            quantity: Array.isArray(comments) ? comments.length : (quantity || 1)
          };
          
          // Si c'est un service de commentaires personnalisés, ajouter les commentaires
          if (exoService.type === 'Custom Comments' && Array.isArray(comments) && comments.length > 0) {
            exoParams.comments = comments.join('\n');
          }
          
          console.log(`📤 Envoi commande ExoSupplier:`, exoParams);
          
          const exoResult = await callExoSupplierAPI(exoParams);
          
          if (exoResult.order) {
            exoOrderId = exoResult.order;
            isExoOrder = true;
            
            await orderDocRef.update({
              isAutoOrder: true,
              exoOrderId: exoOrderId,
              exoServiceId: exoServiceId,
              exoServiceName: exoService.name,
              exoStatus: 'Pending',
              status: 'en cours',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`✅ Commande ExoSupplier créée: #${exoOrderId} pour service ${exoServiceId}`);
          } else {
            console.error('❌ Erreur ExoSupplier (solde fournisseur insuffisant?):', exoResult.error || 'Réponse invalide');
            await userRef.update({ balance: admin.firestore.FieldValue.increment(finalCost) });
            await orderDocRef.delete();
            console.log(`💰 Remboursement de ${finalCost} XAF effectué, commande supprimée`);
            return res.status(503).json({
              success: false,
              error: 'Ce service est temporairement indisponible. Veuillez réessayer plus tard ou contacter un administrateur.',
              adminContact: '+237699853665',
              refunded: true
            });
          }
        }
      } catch (exoError) {
        console.error('❌ Erreur appel ExoSupplier:', exoError.message || exoError);
        await userRef.update({ balance: admin.firestore.FieldValue.increment(finalCost) });
        await orderDocRef.delete();
        console.log(`💰 Remboursement de ${finalCost} XAF effectué suite à erreur fournisseur`);
        return res.status(503).json({
          success: false,
          error: 'Ce service est temporairement indisponible. Veuillez réessayer plus tard ou contacter un administrateur.',
          adminContact: '+237699853665',
          refunded: true
        });
      }
    }

    // Mise à jour des stats revendeur (si applicable)
    // IMPORTANT: On compte uniquement les commandes passées depuis l'espace revendeur
    if (isResellerOrder && userData.isReseller) {
      console.log('📊 Mise à jour des stats revendeur...');
      try {
        const discountAmount = Math.max(0, (normalPrice - finalCost));
        const now = new Date();
        const yyyy = now.getUTCFullYear();
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const todayKey = `${yyyy}-${mm}-${dd}`;

        console.log(`💰 Calculs - Prix normal: ${normalPrice}, Prix final: ${finalCost}, Économies: ${discountAmount} FCFA`);

        // CORRECTION: Initialiser les champs manquants pour les anciens revendeurs
        const userUpdate = {};
        
        // Vérifier si les champs existent, sinon initialiser à 0
        if (typeof userData.resellerTotalOrders !== 'number') {
          userUpdate['resellerTotalOrders'] = 1; // Première commande
          console.log('⚠️ Initialisation de resellerTotalOrders à 1');
        } else {
          userUpdate['resellerTotalOrders'] = admin.firestore.FieldValue.increment(1);
        }
        
        if (typeof userData.resellerRevenue !== 'number') {
          userUpdate['resellerRevenue'] = finalCost; // Premier revenu
          console.log(`⚠️ Initialisation de resellerRevenue à ${finalCost}`);
        } else {
          userUpdate['resellerRevenue'] = admin.firestore.FieldValue.increment(finalCost);
        }
        
        // CA hebdomadaire (réinitialisé chaque dimanche à 1h)
        if (typeof userData.resellerWeeklyRevenue !== 'number') {
          userUpdate['resellerWeeklyRevenue'] = finalCost; // Premier CA de la semaine
          console.log(`⚠️ Initialisation de resellerWeeklyRevenue à ${finalCost}`);
        } else {
          userUpdate['resellerWeeklyRevenue'] = admin.firestore.FieldValue.increment(finalCost);
        }
        
        if (typeof userData.totalSavings !== 'number') {
          userUpdate['totalSavings'] = discountAmount; // Première économie
          console.log(`⚠️ Initialisation de totalSavings à ${discountAmount}`);
        } else {
          userUpdate['totalSavings'] = admin.firestore.FieldValue.increment(discountAmount);
        }
        
        // Ces champs utilisent toujours increment (fonctionnent même si absents)
        userUpdate[`resellerOrdersByDay.${todayKey}`] = admin.firestore.FieldValue.increment(1);
        userUpdate['lastResellerUpdate'] = admin.firestore.FieldValue.serverTimestamp();

        console.log('📝 Mise à jour:', {
          jour: todayKey,
          totalOrders: typeof userData.resellerTotalOrders === 'number' ? '+1' : '1 (init)',
          revenue: typeof userData.resellerRevenue === 'number' ? `+${finalCost}` : `${finalCost} (init)`,
          weeklyRevenue: typeof userData.resellerWeeklyRevenue === 'number' ? `+${finalCost}` : `${finalCost} (init)`,
          savings: typeof userData.totalSavings === 'number' ? `+${discountAmount}` : `${discountAmount} (init)`
        });

        await userRef.update(userUpdate);

        // Récupérer les données mises à jour pour calculer les stats hebdomadaires
        const freshUserSnap2 = await userRef.get();
        const freshUserData2 = freshUserSnap2.exists ? freshUserSnap2.data() : {};
        const ordersByDay = freshUserData2.resellerOrdersByDay || {};

        // Calculer le total des commandes sur 7 jours
        const sums = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(Date.UTC(yyyy, now.getUTCMonth(), now.getUTCDate() - i));
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          const key = `${y}-${m}-${day}`;
          const v = Number(ordersByDay[key] || 0);
          sums.push(v);
        }
        const computedWeekly = sums.reduce((a,b) => a + b, 0);

        // Calculer le nouveau niveau et la remise
        const newLevel = calculateResellerLevel(computedWeekly);
        const newDiscount = calculateDiscountRate(newLevel);

        // Second update : mettre à jour weekly orders, level et discount EN UN SEUL APPEL
        await userRef.update({
          resellerWeeklyOrders: computedWeekly,
          resellerLevel: newLevel,
          discountRate: newDiscount
        });

        console.log(`✅ Stats revendeur mises à jour: Weekly=${computedWeekly}, Level=${newLevel}, Discount=${newDiscount}%`);
      } catch (errUpdate) {
        console.error("❌ Erreur calcul/écriture resellerWeeklyOrders:", errUpdate.message || errUpdate);
      }
    }

    // Notification Twilio (admin) - SAUF si commande ExoSupplier automatisée
    let twilioSuccess = false;
    
    // Déterminer si c'est une commande manuelle due à un échec ExoSupplier
    const isManualDueToExoFailure = exoServiceId && !isExoOrder;
    
    // Si la commande est automatisée via ExoSupplier, pas besoin de notification WhatsApp
    if (isExoOrder && exoOrderId) {
      twilioSuccess = true; // Considérer comme succès car automatisé
      console.log(`🤖 Commande automatisée ExoSupplier #${exoOrderId} - Pas de notification WhatsApp nécessaire`);
    } else {
      // Commande manuelle - envoyer notification WhatsApp
      try {
        const freshForMsgSnap = await userRef.get();
      const freshForMsg = freshForMsgSnap.exists ? freshForMsgSnap.data() : userData;
      const username = freshForMsg.username || userData.username || 'N/A';
      const qty = Array.isArray(comments) ? comments.length : (quantity ? Number(quantity) : 0);

      const userEmail = freshForMsg.email || userData.email || 'Non renseigné';
      const userPhone = freshForMsg.phone || userData.phone || 'Non renseigné';
      const referralBal = freshForMsg.referralBalance || 0;
      const withdrawalBal = freshForMsg.withdrawalBalance || 0;
      const userCountry = freshForMsg.country || freshForMsg.pays || userData.country || userData.pays || 'CM';
      const userCurrencyConfig = CURRENCY_CONFIG[userCountry] || CURRENCY_CONFIG['CM'];

      // Ajouter un badge MANUEL si la commande devait être automatique mais a échoué
      const manualBadge = isManualDueToExoFailure 
        ? '🔴 [MANUEL - SOLDE EXOSUPPLIER INSUFFISANT]' 
        : (exoServiceId ? '📋 [MANUEL - Service non mappé]' : '📋 [MANUEL]');

      const lines = [
        `${manualBadge}`,
        '📣 Nouvelle commande',
        `• ID Commande : ${orderId}`,
        `• Client : ${username} (${req.userId})`,
        `• Email : ${userEmail}`,
        `• Téléphone : ${userPhone}`,
        `• Pays : ${userCurrencyConfig.name} (${userCountry})`,
        `• Date : ${new Date().toLocaleString('fr-FR')}`,
        `• Plateforme : ${platform}`,
        `• Service : ${service}${subOption ? ` → ${subOption}` : ''}`,
        `• Qualité : ${quality}`,
        `• Quantité : ${qty}`,
        currentQuantity !== null && currentQuantity !== undefined ? `📊 Qté actuelle : ${Number(currentQuantity).toLocaleString('fr-FR')}` : null,
        estimatedQuantity !== null && estimatedQuantity !== undefined ? `📈 Qté estimée : ${Number(estimatedQuantity).toLocaleString('fr-FR')}` : null,
        `• Montant (HT): ${formatDualCurrency(normalPrice, userCountry)}`,
        `• Remise : ${effectiveDiscountRate}%`,
        `⚡ Mode Vitesse : ${speedMode ? `OUI (+${formatDualCurrency(speedModeCharge, userCountry)} soit +10%)` : 'NON'}`,
        `• Montant Final: ${formatDualCurrency(finalCost, userCountry)}`,
        `• Solde Restant: ${formatDualCurrency(newBalanceAfter, userCountry)}`,
        `• Solde Affiliation: ${formatDualCurrency(referralBal, userCountry)}`,
        `• Solde Retrait: ${formatDualCurrency(withdrawalBal, userCountry)}`,
        `• Lien : ${link || 'N/A'}`,
        `• Contact : ${contactType || 'N/A'} - ${contact || 'N/A'}`
      ];

      if (freshForMsg.isReseller) {
        lines.push('--- Infos Revendeur ---');
        lines.push(`• Commandes (Total) : ${freshForMsg.resellerTotalOrders || 0}`);
        lines.push(`• Commandes (Semaine): ${freshForMsg.resellerWeeklyOrders || 0}`);
        lines.push(`• Total ventes (HT) : ${formatDualCurrency(freshForMsg.resellerRevenue || 0, userCountry)}`);
        lines.push(`• Total économies : ${formatDualCurrency(freshForMsg.totalSavings || 0, userCountry)}`);
      }

      if (Array.isArray(comments) && comments.length > 0) {
        lines.push('• Commentaires :');
        comments.forEach((c, idx) => lines.push(`${idx + 1}. ${c.trim()}`));
      }

      if (clientTwilio && TWILIO_WHATSAPP_NUMBER && ADMIN_WHATSAPP_NUMBER) {
        await clientTwilio.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
          body: lines.filter(line => line !== null).join('\n')
        });
        twilioSuccess = true;
        console.log('✅ Notification Twilio envoyée avec succès');
      }
    } catch (twErr) {
      console.error('❌ ÉCHEC Twilio - Remboursement en cours...', (twErr && twErr.message) || twErr);
      twilioSuccess = false;
      
      // Remboursement de l'utilisateur
      try {
        await userRef.update({
          balance: admin.firestore.FieldValue.increment(finalCost)
        });
        
        // Mettre le statut de la commande à "annulée"
        await orderDocRef.update({ 
          status: 'annulée',
          cancelReason: 'Échec d\'envoi de la commande',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Remboursement effectué: ${finalCost} FCFA pour commande ${orderId}`);
      } catch (refundErr) {
        console.error('❌ Erreur lors du remboursement:', refundErr);
      }
      
      // Ne pas continuer si Twilio a échoué - renvoyer un code d'erreur spécifique
        return res.status(500).json({ 
          success: false, 
          errorCode: 'SERVER_ERROR',
          error: 'Une erreur serveur s\'est produite. Votre commande a été annulée et remboursée automatiquement.'
        });
      }
    } // Fin du else (commande manuelle)

    // La mise à jour des statuts est maintenant gérée automatiquement par la tâche cron
    // qui vérifie toutes les 5 minutes les commandes en attente/en cours
    console.log(`⏰ Commande créée - Les statuts seront mis à jour automatiquement par le système`);
    console.log(`   → "en cours" après 5 min, "succès" après ${computed.finalTime}`);

    console.log('✅ Commande traitée avec succès:', { orderId, finalCost, newBalanceAfter });
    return res.json({ success:true, finalCost, newBalance: newBalanceAfter, orderId });

  } catch (err) {
    console.error('❌ Erreur /order (serveur):', err);
    const msg = (err && err.message) || 'Erreur serveur';
    const msgLower = String(msg).toLowerCase();
    
    // Détecter le type d'erreur et renvoyer un code approprié
    let errorCode = 'UNKNOWN_ERROR';
    let userFriendlyError = msg;
    
    if (msgLower.includes('insuffisant') || msgLower.includes('solde')) {
      errorCode = 'INSUFFICIENT_BALANCE';
      userFriendlyError = 'Solde insuffisant pour effectuer cette commande.';
    } else if (msgLower.includes('introuvable') || msgLower.includes('non trouvé')) {
      errorCode = 'USER_NOT_FOUND';
      userFriendlyError = 'Utilisateur introuvable. Veuillez vous reconnecter.';
    } else if (msgLower.includes('quantité') || msgLower.includes('commentaires requis')) {
      errorCode = 'VALIDATION_ERROR';
      userFriendlyError = msg; // Garder le message original pour les erreurs de validation
    } else if (msgLower.includes('service') || msgLower.includes('plateforme')) {
      errorCode = 'SERVICE_ERROR';
      userFriendlyError = msg; // Garder le message original pour les erreurs de service
    }
    
    return res.status(errorCode === 'INSUFFICIENT_BALANCE' ? 400 : 500).json({ 
      success: false, 
      errorCode,
      error: userFriendlyError 
    });
  }
});

// HISTORIQUE COMMANDES UTILISATEUR
app.get('/users/:userId/orders', validateUser, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const snap = await getDB().collection('commandes')
      .where('userId','==', req.userId)
      .orderBy('createdAt','desc').get();

    const orders = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        orderId: d.orderId,
        orderType: d.orderType || 'normal',
        date: d.createdAt ? (d.createdAt.toMillis ? d.createdAt.toMillis() : null) : null,
        platform: d.platform,
        service: d.service,
        quality: d.quality,
        quantity: d.quantity || null,
        totalCost: d.totalCost,
        finalCost: d.finalCost,
        discountRate: d.discountRate || 0,
        discountAmount: d.discountAmount || 0,
        link: d.link,
        status: d.status,
        contactType: d.contactType,
        contact: d.contact
      };
    });
    res.json({ success:true, orders });
  } catch (err) {
    console.error('❌ GET /users/:userId/orders:', err);
    res.status(500).json({ success:false, error:err.message });
  }
});

// TRANSFERT REFERRAL VERS BALANCE (main ou withdrawal)
app.post('/users/:userId/transfer-referral', authenticateToken, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const { target } = req.body;
    if (target && !['main', 'withdrawal'].includes(target)) {
      return res.status(400).json({ success:false, error: 'Destination invalide. Utilisez "main" ou "withdrawal".' });
    }
    const transferTarget = target || 'main';

    const userRef = getDB().collection('users').doc(req.userId);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ success:false, error:'Utilisateur introuvable.' });

    const data = snap.data();
    const toTransfer = data.referralBalance || 0;
    if (toTransfer <= 0) {
      return res.json({ success:true, transferred: 0, message: 'Aucun solde à transférer.' });
    }

    const updateData = { referralBalance: 0 };
    let description = '';
    
    if (transferTarget === 'main') {
      updateData.balance = admin.firestore.FieldValue.increment(toTransfer);
      description = 'Transfert vers solde principal';
    } else {
      updateData.withdrawalBalance = admin.firestore.FieldValue.increment(toTransfer);
      description = 'Transfert vers solde de retrait';
    }

    await userRef.update(updateData);

    await getDB().collection('fapshiTransactions').add({
      userId: req.userId,
      date: admin.firestore.FieldValue.serverTimestamp(),
      type: 'Transfert',
      label: description,
      amount: toTransfer
    });

    const updatedSnap = await userRef.get();
    const updatedData = updatedSnap.data();

    console.log(`✅ Transfert réussi: ${toTransfer} XAF vers ${transferTarget} pour ${req.userId}`);

    res.json({ 
      success: true, 
      transferred: toTransfer,
      target: transferTarget,
      message: `${toTransfer} XAF transférés vers ${transferTarget === 'main' ? 'solde principal' : 'solde de retrait'}.`,
      balances: {
        balance: updatedData.balance || 0,
        referralBalance: updatedData.referralBalance || 0,
        withdrawalBalance: updatedData.withdrawalBalance || 0
      }
    });
  } catch (err) {
    console.error('❌ Erreur transfer-referral:', err);
    res.status(500).json({ success:false, error:err.message });
  }
});

// DEMANDE DE RETRAIT
app.post('/users/:userId/request-withdrawal', validateUser, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const { phoneNumber, method } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success:false, error: 'Numéro de téléphone requis.' });
    }

    const userRef = getDB().collection('users').doc(req.userId);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ success:false, error:'Utilisateur introuvable.' });

    const data = snap.data();
    const withdrawalBalance = data.withdrawalBalance || 0;
    const MIN_WITHDRAWAL = 1000;

    if (withdrawalBalance < MIN_WITHDRAWAL) {
      return res.status(400).json({ 
        success:false, 
        error: `Solde de retrait insuffisant. Minimum requis: ${MIN_WITHDRAWAL} XAF. Votre solde: ${withdrawalBalance} XAF.`
      });
    }

    const withdrawalRef = getDB().collection('withdrawals').doc();
    await withdrawalRef.set({
      userId: req.userId,
      email: data.email || '',
      username: data.username || '',
      amount: withdrawalBalance,
      phoneNumber: phoneNumber,
      method: method || 'Mobile Money',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await userRef.update({
      withdrawalBalance: 0
    });

    await userRef.collection('activities').add({
      type: 'withdrawal_request',
      amount: -withdrawalBalance,
      date: admin.firestore.FieldValue.serverTimestamp(),
      description: `Demande de retrait de ${withdrawalBalance} XAF vers ${phoneNumber}`
    });

    console.log(`💸 Demande de retrait: ${withdrawalBalance} XAF pour ${data.username || req.userId} vers ${phoneNumber}`);

    res.json({ 
      success:true, 
      message: `Demande de retrait de ${withdrawalBalance} XAF envoyée. Vous serez contacté sous 24h.`,
      withdrawalId: withdrawalRef.id,
      amount: withdrawalBalance
    });
  } catch (err) {
    console.error('❌ Erreur request-withdrawal:', err);
    res.status(500).json({ success:false, error:err.message });
  }
});

// TRACKER LES VISITES DU DASHBOARD POUR LA PROMO WHATSAPP
app.post('/api/track-dashboard-visit', async (req, res) => {
  console.log('📊 Tracking visite dashboard pour userId:', req.body?.userId);
  try {
    const { userId } = req.body;
    if (!userId) {
      console.log('❌ userId manquant pour track-dashboard-visit');
      return res.status(400).json({ success: false, error: 'userId requis' });
    }
    
    if (!getDB()) {
      return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });
    }
    
    const userRef = getDB().collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    }
    
    const userData = userDoc.data();
    const currentVisits = userData.dashboardVisits || 0;
    const hasSeenPromo = userData.hasSeenWhatsAppPromo || false;
    
    // Déterminer si on doit afficher la promo (>= 5 visites et pas encore vu)
    // Utilise >= pour s'assurer que l'utilisateur voit la promo même si une visite précédente a échoué
    const shouldShowPromo = (currentVisits + 1) >= 5 && !hasSeenPromo;
    
    // Mise à jour atomique : incrémenter les visites ET marquer comme vu si on affiche
    const updateData = {
      dashboardVisits: admin.firestore.FieldValue.increment(1)
    };
    
    // Marquer automatiquement comme vu quand on affiche (garantit une seule affichage)
    if (shouldShowPromo) {
      updateData.hasSeenWhatsAppPromo = true;
      updateData.promoShownAt = admin.firestore.FieldValue.serverTimestamp();
    }
    
    await userRef.update(updateData);
    
    res.json({
      success: true,
      visits: currentVisits + 1,
      shouldShowPromo
    });
  } catch (err) {
    console.error('❌ Erreur track-dashboard-visit:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// MARQUER LA PROMO WHATSAPP COMME VUE
app.post('/api/mark-promo-seen', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requis' });
    }
    
    if (!getDB()) {
      return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });
    }
    
    const userRef = getDB().collection('users').doc(userId);
    await userRef.update({
      hasSeenWhatsAppPromo: true
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur mark-promo-seen:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// RÉINITIALISER LE COMPTEUR DE VISITES POUR TOUS LES UTILISATEURS (Admin)
// Protégé par clé API admin - DOIT être configurée dans les variables d'environnement
app.post('/api/admin/reset-all-visits', async (req, res) => {
  try {
    // Vérification stricte de la clé admin - pas de fallback
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
    const ADMIN_SECRET_KEY = process.env.ADMIN_API_KEY;
    
    if (!ADMIN_SECRET_KEY) {
      console.error('❌ ADMIN_API_KEY non configurée');
      return res.status(500).json({ success: false, error: 'Configuration admin manquante.' });
    }
    
    if (adminKey !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ success: false, error: 'Accès refusé. Clé admin invalide.' });
    }
    
    if (!getDB()) {
      return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });
    }
    
    const usersSnapshot = await getDB().collection('users').get();
    const batch = getDB().batch();
    let count = 0;
    
    usersSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        dashboardVisits: 0,
        hasSeenWhatsAppPromo: false
      });
      count++;
    });
    
    await batch.commit();
    
    console.log(`🔄 Compteurs de visites réinitialisés pour ${count} utilisateurs`);
    
    res.json({
      success: true,
      message: `Compteurs réinitialisés pour ${count} utilisateurs`
    });
  } catch (err) {
    console.error('❌ Erreur reset-all-visits:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ENVOI DE CADEAU DE BIENVENUE VIA TWILIO WHATSAPP
app.post('/api/send-gift-notification', async (req, res) => {
  console.log('🎁 Réception demande notification cadeau:', JSON.stringify(req.body, null, 2));
  try {
    const { giftType, userInfo, giftDetails } = req.body;
    
    if (!giftType || !userInfo) {
      console.log('❌ Données manquantes pour notification cadeau');
      return res.status(400).json({ success: false, error: 'Données manquantes.' });
    }
    
    // Utiliser les mêmes variables globales que les autres notifications
    if (!clientTwilio || !TWILIO_WHATSAPP_NUMBER || !ADMIN_WHATSAPP_NUMBER) {
      console.log('⚠️ Configuration Twilio incomplète pour notification cadeau');
      console.log(`  - clientTwilio: ${clientTwilio ? 'OK' : 'MANQUANT'}`);
      console.log(`  - TWILIO_WHATSAPP_NUMBER: ${TWILIO_WHATSAPP_NUMBER ? 'OK' : 'MANQUANT'}`);
      console.log(`  - ADMIN_WHATSAPP_NUMBER: ${ADMIN_WHATSAPP_NUMBER ? 'OK' : 'MANQUANT'}`);
      return res.json({ success: true, message: 'Notification enregistrée (WhatsApp non configuré)' });
    }
    
    console.log('✅ Configuration Twilio OK, envoi en cours...');
    
    // Formatage de la date de création du compte
    let creationDate = 'Non disponible';
    if (userInfo.createdAt) {
      const date = new Date(userInfo.createdAt);
      creationDate = date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    // Construction du message selon le type de cadeau
    let giftDescription = '';
    switch(giftType) {
      case 'money':
        giftDescription = `💰 *CADEAU: 25 FCFA*\n📧 Email à créditer: ${giftDetails.email || 'Non fourni'}`;
        break;
      case 'likes':
        giftDescription = `❤️ *CADEAU: 50 LIKES*\n📱 Plateforme: ${giftDetails.platform || 'Non spécifiée'}\n🔗 Lien: ${giftDetails.link || 'Non fourni'}`;
        break;
      case 'tiktok':
        giftDescription = `🎬 *CADEAU: 5000 VUES TIKTOK*\n🔗 Lien: ${giftDetails.link || 'Non fourni'}`;
        break;
      default:
        giftDescription = `🎁 *CADEAU INCONNU*`;
    }
    
    const message = `🎁 *NOUVEAU CADEAU DE BIENVENUE*\n━━━━━━━━━━━━━━━━━━━━━\n\n👤 *INFORMATIONS UTILISATEUR*\n📛 Nom: ${userInfo.username || 'Non défini'}\n📧 Email: ${userInfo.email || 'Non défini'}\n🌍 Pays: ${userInfo.country || 'Non défini'}\n📱 Téléphone: ${userInfo.phone || 'Non défini'}\n📅 Compte créé le: ${creationDate}\n\n━━━━━━━━━━━━━━━━━━━━━\n\n${giftDescription}\n\n📲 *CONTACT WHATSAPP*\n${giftDetails.whatsapp || 'Non fourni'}\n\n━━━━━━━━━━━━━━━━━━━━━\n⏰ Demande reçue le: ${new Date().toLocaleString('fr-FR')}\n🔔 Social Boost Horizon`;
    
    // Utiliser le client global Twilio
    await clientTwilio.messages.create({
      body: message,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
    });
    
    console.log(`🎁 Notification cadeau envoyée: ${giftType} pour ${userInfo.username || userInfo.email}`);
    
    res.json({ success: true, message: 'Notification envoyée avec succès.' });
  } catch (err) {
    console.error('❌ Erreur envoi notification cadeau:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// VÉRIFIER UNE COMMANDE POUR RÉCLAMATION
app.post('/verify-order-for-claim', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });

    const { orderId, userId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'Numéro de commande requis.' });
    }

    const searchId = orderId.toString().trim();
    let orderDoc = null;
    let order = null;

    // Méthode 1: Chercher par ID du document Firestore
    const docRef = await getDB().collection('commandes').doc(searchId).get();
    if (docRef.exists) {
      orderDoc = docRef;
      order = docRef.data();
      order.orderId = order.orderId || searchId;
    }

    // Méthode 2: Chercher par champ orderId
    if (!order) {
      const query1 = await getDB().collection('commandes')
        .where('orderId', '==', searchId)
        .limit(1)
        .get();
      if (!query1.empty) {
        orderDoc = query1.docs[0];
        order = orderDoc.data();
        order.orderId = order.orderId || orderDoc.id;
      }
    }

    // Méthode 3: Chercher par champ orderId en nombre
    if (!order && !isNaN(searchId)) {
      const query2 = await getDB().collection('commandes')
        .where('orderId', '==', parseInt(searchId))
        .limit(1)
        .get();
      if (!query2.empty) {
        orderDoc = query2.docs[0];
        order = orderDoc.data();
        order.orderId = order.orderId || orderDoc.id;
      }
    }

    // Méthode 4: Chercher par champ id
    if (!order) {
      const query3 = await getDB().collection('commandes')
        .where('id', '==', searchId)
        .limit(1)
        .get();
      if (!query3.empty) {
        orderDoc = query3.docs[0];
        order = orderDoc.data();
        order.orderId = order.orderId || order.id || orderDoc.id;
      }
    }

    // Méthode 5: Chercher par champ id en nombre
    if (!order && !isNaN(searchId)) {
      const query4 = await getDB().collection('commandes')
        .where('id', '==', parseInt(searchId))
        .limit(1)
        .get();
      if (!query4.empty) {
        orderDoc = query4.docs[0];
        order = orderDoc.data();
        order.orderId = order.orderId || order.id || orderDoc.id;
      }
    }

    // Méthode 6: Chercher dans la collection autoOrders (commandes automatiques MTP/SMMGen)
    if (!order) {
      const autoDocRef = await getDB().collection('autoOrders').doc(searchId).get();
      if (autoDocRef.exists) {
        orderDoc = autoDocRef;
        order = autoDocRef.data();
        order.orderId = order.orderId || searchId;
        order.isAutoOrder = true;
      }
    }

    // Méthode 7: Chercher par champ orderId dans autoOrders
    if (!order) {
      const autoQuery1 = await getDB().collection('autoOrders')
        .where('orderId', '==', searchId)
        .limit(1)
        .get();
      if (!autoQuery1.empty) {
        orderDoc = autoQuery1.docs[0];
        order = orderDoc.data();
        order.orderId = order.orderId || orderDoc.id;
        order.isAutoOrder = true;
      }
    }

    if (!order) {
      console.log(`❌ Commande ${searchId} introuvable dans Firestore (commandes et autoOrders)`);
      return res.json({ 
        success: false, 
        eligible: false,
        errorCode: 'ORDER_NOT_FOUND',
        reason: `Commande #${searchId} introuvable dans notre système. Veuillez vérifier le numéro de commande et réessayer.`
      });
    }

    console.log(`✅ Commande ${searchId} trouvée:`, JSON.stringify(order, null, 2).substring(0, 500));

    // Vérifier si cette commande a déjà été réclamée
    const existingClaimQuery = await getDB().collection('reclamations')
      .where('orderId', '==', order.orderId || searchId)
      .limit(1)
      .get();

    if (!existingClaimQuery.empty) {
      const existingClaim = existingClaimQuery.docs[0].data();
      return res.json({ 
        success: true, 
        eligible: false,
        errorCode: 'ALREADY_CLAIMED',
        reason: `Cette commande a déjà fait l'objet d'une réclamation (${existingClaim.reclamationId}). Une seule réclamation est autorisée par commande. Pour un nouveau problème, veuillez passer une nouvelle commande.`,
        existingClaim: {
          reclamationId: existingClaim.reclamationId,
          status: existingClaim.status,
          quantityLost: existingClaim.quantityLost,
          createdAt: existingClaim.createdAt
        }
      });
    }

    if (userId && order.userId !== userId) {
      return res.json({ 
        success: false, 
        eligible: false,
        reason: 'Cette commande ne vous appartient pas.'
      });
    }

    const qualityValue = (order.qualite || order.quality || '').toString().toLowerCase();
    const isHighQuality = qualityValue === 'haute' || qualityValue === 'high' || qualityValue === 'premium';

    if (!isHighQuality) {
      return res.json({ 
        success: true, 
        eligible: false,
        errorCode: 'NOT_HIGH_QUALITY',
        reason: `Cette commande est en qualité "${qualityValue || 'moyenne'}". Le remplissage gratuit est exclusivement réservé aux commandes passées en HAUTE QUALITÉ. Pour vos prochaines commandes, choisissez l'option "Haute qualité" pour bénéficier de la garantie de remplissage.`,
        order: {
          orderId: order.orderId,
          platform: order.platform || order.plateforme,
          service: order.service || order.typeService,
          quantity: order.quantite || order.quantity,
          quality: order.qualite || order.quality || 'moyenne',
          link: order.lien || order.link,
          status: order.status || order.statut,
          createdAt: order.createdAt
        }
      });
    }

    let orderDate;
    if (order.createdAt && order.createdAt._seconds) {
      orderDate = new Date(order.createdAt._seconds * 1000);
    } else if (order.createdAt && order.createdAt.toDate) {
      orderDate = order.createdAt.toDate();
    } else if (order.date) {
      orderDate = new Date(order.date);
    } else {
      orderDate = new Date();
    }

    const now = new Date();
    const daysSinceOrder = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

    if (daysSinceOrder > 30) {
      return res.json({ 
        success: true, 
        eligible: false,
        errorCode: 'ORDER_TOO_OLD',
        reason: `Cette commande a été passée il y a ${daysSinceOrder} jours. La garantie de remplissage gratuit expire après 30 jours. Malheureusement, votre commande n'est plus éligible.`,
        order: {
          orderId: order.orderId,
          platform: order.platform || order.plateforme,
          service: order.service || order.typeService,
          quantity: order.quantite || order.quantity,
          quality: order.qualite || order.quality,
          link: order.lien || order.link,
          status: order.status || order.statut,
          createdAt: order.createdAt,
          daysSinceOrder: daysSinceOrder
        }
      });
    }

    res.json({ 
      success: true, 
      eligible: true,
      message: 'Vous êtes éligible au remplissage gratuit !',
      order: {
        orderId: order.orderId,
        platform: order.platform || order.plateforme,
        service: order.service || order.typeService,
        quantity: order.quantite || order.quantity,
        quality: order.qualite || order.quality,
        link: order.lien || order.link,
        status: order.status || order.statut,
        price: order.prix || order.price,
        createdAt: order.createdAt,
        daysSinceOrder: daysSinceOrder
      }
    });

  } catch (err) {
    console.error('❌ Erreur verify-order-for-claim:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// SOUMETTRE UNE RÉCLAMATION
app.post('/submit-claim', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });

    const { orderId, userId, userEmail, userName, quantityLost, description } = req.body;

    if (!orderId || !quantityLost) {
      return res.status(400).json({ success: false, error: 'Données incomplètes.' });
    }

    const searchId = orderId.toString().trim();
    let order = null;

    // Méthode 1: Chercher par ID du document
    const docRef = await getDB().collection('commandes').doc(searchId).get();
    if (docRef.exists) {
      order = docRef.data();
      order.orderId = order.orderId || searchId;
    }

    // Méthode 2: Chercher par champ orderId (string)
    if (!order) {
      const q1 = await getDB().collection('commandes').where('orderId', '==', searchId).limit(1).get();
      if (!q1.empty) { order = q1.docs[0].data(); order.orderId = order.orderId || q1.docs[0].id; }
    }

    // Méthode 3: Chercher par champ orderId (nombre)
    if (!order && !isNaN(searchId)) {
      const q2 = await getDB().collection('commandes').where('orderId', '==', parseInt(searchId)).limit(1).get();
      if (!q2.empty) { order = q2.docs[0].data(); order.orderId = order.orderId || q2.docs[0].id; }
    }

    // Méthode 4: Chercher par champ id
    if (!order) {
      const q3 = await getDB().collection('commandes').where('id', '==', searchId).limit(1).get();
      if (!q3.empty) { order = q3.docs[0].data(); order.orderId = order.orderId || order.id || q3.docs[0].id; }
    }

    if (!order) {
      return res.status(400).json({ success: false, error: `Commande #${searchId} introuvable.` });
    }

    // Générer un ID séquentiel avec transaction
    const counterRef = getDB().collection('counters').doc('reclamations');
    let reclamationId;

    await getDB().runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextNumber = 1;
      
      if (counterDoc.exists) {
        nextNumber = (counterDoc.data().nextSequence || 0) + 1;
      }
      
      reclamationId = `REC_SBH_${nextNumber}`;
      
      // Mettre à jour le compteur
      transaction.set(counterRef, { nextSequence: nextNumber }, { merge: true });
      
      // Créer la réclamation
      const reclamationRef = getDB().collection('reclamations').doc(reclamationId);
      transaction.set(reclamationRef, {
        reclamationId,
        orderId: order.orderId || searchId,
        userId: userId || order.userId,
        userEmail: userEmail || order.email || '',
        userName: userName || order.username || order.nom || order.name || '',
        userPhone: order.phone || order.telephone || order.tel || order.contact || '',
        platform: order.platform || order.plateforme,
        service: order.service || order.typeService,
        quality: order.qualite || order.quality || 'haute',
        link: order.lien || order.link || order.url || '',
        originalQuantity: order.quantite || order.quantity,
        quantityLost: parseInt(quantityLost),
        quantityToRefill: parseInt(quantityLost),
        description: description || '',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    const originalQuantity = order.quantite || order.quantity || 0;
    const qualityOriginal = order.qualite || order.quality || 'haute';
    const clientPhone = order.phone || order.telephone || order.tel || order.contact || '';
    const clientEmail = userEmail || order.email || '';
    const clientName = userName || order.username || order.nom || order.name || '';
    const platformName = order.platform || order.plateforme || '';
    const serviceName = order.service || order.typeService || '';
    const orderLink = order.lien || order.link || order.url || '';

    const message = 
      `🔄 *NOUVELLE RÉCLAMATION - REMPLISSAGE GRATUIT*\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *ID Réclamation:* ${reclamationId}\n` +
      `📦 *Commande originale:* #${order.orderId || searchId}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👤 *INFORMATIONS CLIENT*\n` +
      `• Nom: ${clientName}\n` +
      `• Email: ${clientEmail || 'Non renseigné'}\n` +
      `• Téléphone: ${clientPhone || 'Non renseigné'}\n\n` +
      `📱 *DÉTAILS DE LA COMMANDE ORIGINALE*\n` +
      `• Plateforme: ${platformName}\n` +
      `• Service: ${serviceName}\n` +
      `• Qualité: ${qualityOriginal.toUpperCase()}\n` +
      `• Lien: ${orderLink}\n\n` +
      `📊 *QUANTITÉS*\n` +
      `• Quantité commandée: ${originalQuantity}\n` +
      `• Quantité perdue (chutes): ${quantityLost}\n` +
      `• ⚡ *À RECOMPLÉTER: ${quantityLost}*\n\n` +
      `💬 *Message du client:*\n${description || 'Aucun message'}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏰ Reçu le ${new Date().toLocaleString('fr-FR')}`;

    // Envoyer notification WhatsApp à l'admin
    if (clientTwilio && TWILIO_WHATSAPP_NUMBER && ADMIN_WHATSAPP_NUMBER) {
      try {
        await clientTwilio.messages.create({
          body: message,
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
        });
        console.log(`✅ Réclamation ${reclamationId} - Notification WhatsApp envoyée à l'admin`);
      } catch (whatsappErr) {
        console.error('❌ Erreur WhatsApp pour réclamation:', whatsappErr.message);
      }
    } else {
      console.log(`⚠️ Réclamation ${reclamationId} - Notification WhatsApp non envoyée (Twilio non configuré)`);
    }

    res.json({ 
      success: true, 
      reclamationId,
      message: 'Réclamation envoyée avec succès ! Notre équipe va traiter votre demande sous 24-72h.'
    });

  } catch (err) {
    console.error('❌ Erreur submit-claim:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// CLASSEMENT DES REVENDEURS DE LA SEMAINE
app.get('/reseller-ranking', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });

    // Récupérer tous les revendeurs actifs
    const resellersSnapshot = await getDB().collection('users')
      .where('isReseller', '==', true)
      .get();

    const resellers = [];
    resellersSnapshot.forEach(doc => {
      const data = doc.data();
      resellers.push({
        id: doc.id,
        username: data.username || data.email || 'Anonyme',
        resellerLevel: data.resellerLevel || 'beginner',
        discountRate: data.discountRate || 0,
        weeklyOrders: data.resellerWeeklyOrders || 0,
        weeklyRevenue: data.resellerWeeklyRevenue || 0,
        totalOrders: data.resellerTotalOrders || 0,
        totalRevenue: data.resellerRevenue || 0
      });
    });

    // 1. Classement par commandes hebdomadaires (décroissant)
    const rankingByOrders = [...resellers]
      .filter(r => r.weeklyOrders > 0)
      .sort((a, b) => b.weeklyOrders - a.weeklyOrders)
      .slice(0, 10)
      .map((r, index) => ({ ...r, rank: index + 1 }));

    // 2. Classement par CA hebdomadaire (décroissant) - NOUVEAU champ resellerWeeklyRevenue
    const rankingByWeeklyRevenue = [...resellers]
      .filter(r => r.weeklyRevenue > 0)
      .sort((a, b) => b.weeklyRevenue - a.weeklyRevenue)
      .slice(0, 10)
      .map((r, index) => ({ ...r, rank: index + 1 }));

    // 3. Classement par CA TOTAL (jamais réinitialisé) - champ resellerRevenue
    const rankingByTotalRevenue = [...resellers]
      .filter(r => r.totalRevenue > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map((r, index) => ({ ...r, rank: index + 1 }));

    res.json({ 
      success: true, 
      rankingByOrders,
      rankingByWeeklyRevenue,
      rankingByTotalRevenue,
      totalResellers: resellers.length
    });
  } catch (err) {
    console.error('❌ Erreur reseller-ranking:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DIAGNOSTIC DES COMMANDES REVENDEURS
app.get('/debug-reseller-orders', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });
    
    const { userId } = req.query;
    
    // Début de la semaine
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(1, 0, 0, 0);
    
    // Récupérer les 10 dernières commandes
    let query = getDB().collection('commandes').orderBy('createdAt', 'desc').limit(20);
    if (userId) {
      query = getDB().collection('commandes').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(20);
    }
    
    const ordersSnapshot = await query.get();
    const orders = [];
    
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      let createdAt = null;
      if (data.createdAt) {
        if (data.createdAt.toDate) createdAt = data.createdAt.toDate().toISOString();
        else if (data.createdAt._seconds) createdAt = new Date(data.createdAt._seconds * 1000).toISOString();
      }
      orders.push({
        id: doc.id,
        orderId: data.orderId,
        userId: data.userId,
        isResellerOrder: data.isResellerOrder,
        finalCost: data.finalCost,
        totalCost: data.totalCost,
        createdAt: createdAt,
        isThisWeek: createdAt && new Date(createdAt) >= startOfWeek
      });
    });
    
    // Récupérer les infos du revendeur
    let resellerInfo = null;
    if (userId) {
      const userDoc = await getDB().collection('users').doc(userId).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        resellerInfo = {
          username: data.username,
          isReseller: data.isReseller,
          resellerWeeklyOrders: data.resellerWeeklyOrders,
          resellerWeeklyRevenue: data.resellerWeeklyRevenue,
          resellerRevenue: data.resellerRevenue,
          resellerTotalOrders: data.resellerTotalOrders
        };
      }
    }
    
    res.json({
      success: true,
      startOfWeek: startOfWeek.toISOString(),
      now: now.toISOString(),
      ordersCount: orders.length,
      resellerInfo,
      orders
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SYNCHRONISER LE CA HEBDOMADAIRE DES REVENDEURS (une seule fois)
app.get('/sync-weekly-revenue', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });

    // Calculer le début de la semaine en cours (dimanche 1h)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = dimanche
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(1, 0, 0, 0);

    console.log(`📊 Synchronisation CA hebdo - Début semaine: ${startOfWeek.toISOString()}`);

    // Récupérer tous les revendeurs
    const resellersSnapshot = await getDB().collection('users')
      .where('isReseller', '==', true)
      .get();

    const updates = [];
    let totalUpdated = 0;

    for (const userDoc of resellersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Récupérer les commandes de la semaine pour ce revendeur (filtrage simplifié)
      const ordersSnapshot = await getDB().collection('commandes')
        .where('userId', '==', userId)
        .get();

      let weeklyRevenue = 0;
      let ordersThisWeek = 0;
      let debugOrders = [];
      
      ordersSnapshot.forEach(orderDoc => {
        const orderData = orderDoc.data();
        // Vérifier si c'est une commande revendeur (champ isResellerOrder dans les commandes)
        const isResellerOrder = orderData.isResellerOrder === true;
        
        let orderDate = null;
        if (orderData.createdAt) {
          if (orderData.createdAt.toDate) {
            orderDate = orderData.createdAt.toDate();
          } else if (orderData.createdAt._seconds) {
            orderDate = new Date(orderData.createdAt._seconds * 1000);
          }
        }
        
        // Inclure toutes les commandes revendeur de cette semaine
        if (orderDate && orderDate >= startOfWeek) {
          const price = orderData.finalCost || orderData.totalCost || 0;
          if (isResellerOrder) {
            weeklyRevenue += price;
            ordersThisWeek++;
          }
          debugOrders.push({
            id: orderDoc.id,
            date: orderDate.toISOString(),
            isResellerOrder: isResellerOrder,
            price: price
          });
        }
      });

      // Toujours mettre à jour pour forcer la synchronisation
      const currentWeeklyRevenue = userData.resellerWeeklyRevenue || 0;
      
      // Forcer la mise à jour si > 0 ou si différent
      if (weeklyRevenue > 0 || weeklyRevenue !== currentWeeklyRevenue) {
        await getDB().collection('users').doc(userId).update({
          resellerWeeklyRevenue: weeklyRevenue
        });
        updates.push({
          userId,
          username: userData.username || userData.email,
          old: currentWeeklyRevenue,
          new: weeklyRevenue,
          ordersThisWeek: ordersThisWeek,
          totalOrdersInDb: ordersSnapshot.size,
          debugOrders: debugOrders.slice(0, 5) // Montrer les 5 premières commandes de la semaine
        });
        totalUpdated++;
      }
    }

    console.log(`✅ Synchronisation terminée: ${totalUpdated} revendeurs mis à jour`);
    res.json({ 
      success: true, 
      message: `${totalUpdated} revendeurs synchronisés`,
      startOfWeek: startOfWeek.toISOString(),
      updates
    });
  } catch (err) {
    console.error('❌ Erreur sync-weekly-revenue:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// HISTORIQUE DES RÉCLAMATIONS
app.get('/claims-history', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'Base de données non initialisée.' });

    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId requis pour voir les réclamations.' });
    }

    const query = getDB().collection('reclamations')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    const snapshot = await query.limit(50).get();
    
    const claims = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Convertir le timestamp Firestore en string ISO
      let createdAtStr = null;
      if (data.createdAt) {
        if (data.createdAt.toDate) {
          createdAtStr = data.createdAt.toDate().toISOString();
        } else if (data.createdAt._seconds) {
          createdAtStr = new Date(data.createdAt._seconds * 1000).toISOString();
        } else if (typeof data.createdAt === 'string') {
          createdAtStr = data.createdAt;
        }
      }
      claims.push({
        reclamationId: data.reclamationId,
        orderId: data.orderId,
        platform: data.platform,
        service: data.service,
        quality: data.quality,
        link: data.link,
        originalQuantity: data.originalQuantity,
        quantityLost: data.quantityLost,
        quantityToRefill: data.quantityToRefill,
        status: data.status,
        userName: data.userName,
        userEmail: data.userEmail,
        createdAt: createdAtStr
      });
    });

    res.json({ success: true, claims });
  } catch (err) {
    console.error('❌ Erreur claims-history:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ACTIVITÉS RÉCENTES
app.get('/users/:userId/activities', validateUser, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const userRef = getDB().collection('users').doc(req.userId);

    const [depSnap, refSnap, actSnap] = await Promise.all([
      userRef.collection('deposits').orderBy('date','desc').limit(20).get(),
      userRef.collection('referrals').orderBy('date','desc').limit(20).get(),
      userRef.collection('activities').orderBy('date','desc').limit(20).get()
    ]);

    const activities = [];

    depSnap.forEach(doc => {
      const d = doc.data();
      activities.push({
        date: d.date.toMillis(),
        label: 'Mon dépôt',
        amount: d.amount,
        extra: ''
      });
    });
    refSnap.forEach(doc => {
      const d = doc.data();
      activities.push({
        date: d.date.toMillis(),
        label: `Cashback ${d.refereeUid}`,
        amount: d.amount,
        extra: `(+${d.referrerShare})`
      });
    });
    actSnap.forEach(doc => {
      const d = doc.data();
      activities.push({
        date: d.date.toMillis(),
        label: d.description || d.type,
        amount: d.amount,
        extra: ''
      });
    });

    activities.sort((a,b) => b.date - a.date);
    res.json({ success:true, activities: activities.slice(0,20) });
  } catch (err) {
    console.error('❌ Erreur activities:', err);
    res.status(500).json({ success:false, error:err.message });
  }
});

// MODIFIER PROFIL
app.put('/users/:userId', validateUser, async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success:false, error: 'Base de données non initialisée.' });

    const { username, phone } = req.body;
    const userRef = getDB().collection('users').doc(req.userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé.' });
    }
    const updates = {};
    if (username !== undefined) {
      if (typeof username === 'string' && username.trim()) updates.username = username.trim();
      else return res.status(400).json({ success: false, error: 'Nom d\'utilisateur invalide.' });
    }
    if (phone !== undefined) {
      if (/^\+[0-9]{8,15}$/.test(phone)) updates.phone = phone;
      else return res.status(400).json({ success: false, error: 'Numéro de téléphone invalide. Format international.' });
    }
    if (!Object.keys(updates).length) {
      return res.json({ success: true, message: 'Aucune modification à enregistrer.' });
    }
    await userRef.update(updates);
    res.json({ success: true, message: 'Profil mis à jour avec succès.' });
  } catch (err) {
    console.error('❌ Erreur PUT /users/:userId:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── RÉVOQUER TOUS LES STATUTS REVENDEURS (RESET COMPLET) ───────────────
app.post('/admin/revoke-all-resellers', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'DB non initialisée' });

    console.log('🔄 Révocation de tous les statuts revendeurs...');
    
    const usersSnapshot = await getDB().collection('users').where('isReseller', '==', true).get();
    
    if (usersSnapshot.empty) {
      return res.json({ success: true, message: 'Aucun revendeur trouvé', revoked: 0 });
    }

    let revoked = 0;
    const batch = getDB().batch();
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      
      // Supprimer TOUS les champs liés au statut revendeur
      batch.update(doc.ref, {
        isReseller: admin.firestore.FieldValue.delete(),
        resellerLevel: admin.firestore.FieldValue.delete(),
        discountRate: admin.firestore.FieldValue.delete(),
        resellerTotalOrders: admin.firestore.FieldValue.delete(),
        resellerWeeklyOrders: admin.firestore.FieldValue.delete(),
        totalSavings: admin.firestore.FieldValue.delete(),
        resellerRevenue: admin.firestore.FieldValue.delete(),
        resellerOrdersByDay: admin.firestore.FieldValue.delete(),
        resellerSince: admin.firestore.FieldValue.delete(),
        lastResellerUpdate: admin.firestore.FieldValue.delete()
      });
      
      revoked++;
      console.log(`❌ Statut revendeur supprimé: ${userData.username || userData.email || doc.id}`);
    });
    
    await batch.commit();
    console.log(`✅ ${revoked} revendeurs révoqués - ils sont maintenant utilisateurs normaux`);
    
    res.json({ 
      success: true, 
      message: `${revoked} statut(s) revendeur révoqué(s) avec succès. Les utilisateurs peuvent maintenant redemander à devenir revendeur.`,
      total: usersSnapshot.size,
      revoked 
    });
  } catch (err) {
    console.error('❌ Erreur révocation revendeurs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── MARQUER TOUTES LES COMMANDES "EN COURS" COMME "SUCCÈS" ─────────────
app.post('/admin/complete-pending-orders', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'DB non initialisée' });

    console.log('✅ Marquage de toutes les commandes "En cours" comme "Succès"...');
    
    const ordersSnapshot = await getDB().collection('commandes')
      .where('status', '==', 'en cours')
      .get();
    
    if (ordersSnapshot.empty) {
      return res.json({ success: true, message: 'Aucune commande en cours trouvée', completed: 0 });
    }

    let completed = 0;
    const batch = getDB().batch();
    
    ordersSnapshot.forEach(doc => {
      batch.update(doc.ref, { 
        status: 'succès',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      completed++;
      console.log(`✅ Commande ${doc.data().orderId} → succès`);
    });
    
    await batch.commit();
    console.log(`✅ ${completed} commandes marquées comme succès`);
    
    res.json({ 
      success: true, 
      message: `${completed} commande(s) marquée(s) comme succès`,
      completed 
    });
  } catch (err) {
    console.error('❌ Erreur complétion commandes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── RÉPARER LES ANCIENS REVENDEURS (ENDPOINT ADMIN) ────────────────────
app.post('/admin/fix-resellers', async (req, res) => {
  try {
    if (!getDB()) return res.status(500).json({ success: false, error: 'DB non initialisée' });

    console.log('🔧 Réparation des anciens revendeurs...');
    
    const usersSnapshot = await getDB().collection('users').where('isReseller', '==', true).get();
    
    if (usersSnapshot.empty) {
      return res.json({ success: true, message: 'Aucun revendeur trouvé', fixed: 0 });
    }

    let fixed = 0;
    const batch = getDB().batch();
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const updates = {};
      
      // Initialiser les champs manquants ou null/undefined
      if (typeof userData.resellerTotalOrders !== 'number') updates.resellerTotalOrders = 0;
      if (typeof userData.resellerWeeklyOrders !== 'number') updates.resellerWeeklyOrders = 0;
      if (typeof userData.totalSavings !== 'number') updates.totalSavings = 0;
      if (typeof userData.resellerRevenue !== 'number') updates.resellerRevenue = 0;
      if (!userData.resellerOrdersByDay || typeof userData.resellerOrdersByDay !== 'object') {
        updates.resellerOrdersByDay = {};
      }
      if (!userData.discountRate) updates.discountRate = 5; // Par défaut 5%
      if (!userData.resellerLevel) updates.resellerLevel = 'beginner';
      
      if (Object.keys(updates).length > 0) {
        batch.update(doc.ref, updates);
        fixed++;
        console.log(`✅ Réparé: ${userData.username || doc.id}`, updates);
      }
    });
    
    if (fixed > 0) {
      await batch.commit();
      console.log(`✅ ${fixed} revendeurs réparés`);
    }
    
    res.json({ 
      success: true, 
      message: `${fixed} revendeur(s) réparé(s) avec succès`,
      total: usersSnapshot.size,
      fixed 
    });
  } catch (err) {
    console.error('❌ Erreur réparation revendeurs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── TESTER TWILIO WHATSAPP (DIAGNOSTIC) ────────────────────────────────
app.get('/api/test-twilio', async (req, res) => {
  try {
    console.log('🧪 Test de la connexion Twilio WhatsApp...');
    
    if (!clientTwilio) {
      return res.status(500).json({ 
        success: false, 
        error: 'Client Twilio non initialisé. Vérifiez TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN' 
      });
    }
    
    if (!TWILIO_WHATSAPP_NUMBER) {
      return res.status(500).json({ 
        success: false, 
        error: 'TWILIO_PHONE_NUMBER non défini dans les variables d\'environnement' 
      });
    }
    
    if (!ADMIN_WHATSAPP_NUMBER) {
      return res.status(500).json({ 
        success: false, 
        error: 'MY_PHONE_NUMBER non défini dans les variables d\'environnement' 
      });
    }
    
    console.log(`📱 Envoi d'un message test de ${TWILIO_WHATSAPP_NUMBER} vers ${ADMIN_WHATSAPP_NUMBER}`);
    
    const message = await clientTwilio.messages.create({
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
      body: '🧪 Test de notification WhatsApp - Social Boost Horizon\n\nSi vous recevez ce message, la configuration Twilio fonctionne correctement !'
    });
    
    console.log('✅ Message test envoyé avec succès:', message.sid);
    
    res.json({ 
      success: true, 
      message: 'Message test envoyé avec succès !',
      details: {
        messageSid: message.sid,
        status: message.status,
        from: TWILIO_WHATSAPP_NUMBER,
        to: ADMIN_WHATSAPP_NUMBER
      }
    });
  } catch (err) {
    console.error('❌ Erreur Twilio:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message || 'Erreur inconnue',
      errorCode: err.code || null,
      details: err.moreInfo || null,
      twilioError: {
        message: err.message,
        code: err.code,
        status: err.status,
        moreInfo: err.moreInfo
      }
    });
  }
});

// ─── ENDPOINT WITHDRAW REQUEST (Demande de retrait) ────────────────────────

app.post('/api/withdraw-request', async (req, res) => {
  try {
    console.log('>>> Withdraw request received');
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token d\'authentification requis' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (tokenErr) {
      console.error('❌ Token verification failed:', tokenErr.message);
      return res.status(401).json({ success: false, error: 'Token invalide ou expiré' });
    }
    
    const authenticatedUserId = decodedToken.uid;
    const { userId, fullName, accountNumber, whatsappNumber, amount, paymentMethod, username, email } = req.body;
    
    if (userId !== authenticatedUserId) {
      console.error(`❌ User ${authenticatedUserId} tried to make withdraw request for ${userId}`);
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }
    
    if (!fullName || !accountNumber || !whatsappNumber || !amount || !paymentMethod) {
      return res.status(400).json({ success: false, error: 'Tous les champs sont requis' });
    }
    
    if (amount < 1000) {
      return res.status(400).json({ success: false, error: 'Le montant minimum est de 1000 FCFA' });
    }
    
    const db = getDB();
    const userRef = db.collection('users').doc(authenticatedUserId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const userData = userDoc.data();
    const withdrawalBalance = userData.withdrawalBalance || 0;
    
    if (amount > withdrawalBalance) {
      return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    // Générer un ID séquentiel avec transaction (comme les réclamations)
    const counterRef = db.collection('counters').doc('withdrawRequests');
    let withdrawRequestId;
    
    await db.runTransaction(async (transaction) => {
      // Obtenir et incrémenter le compteur
      const counterDoc = await transaction.get(counterRef);
      let nextNumber = 1;
      
      if (counterDoc.exists) {
        nextNumber = (counterDoc.data().nextSequence || 0) + 1;
      }
      
      // Formater l'ID avec zéros de remplissage (WR_SBH_01, WR_SBH_02, etc.)
      withdrawRequestId = `WR_SBH_${String(nextNumber).padStart(2, '0')}`;
      
      // Mettre à jour le compteur
      transaction.set(counterRef, { nextSequence: nextNumber }, { merge: true });
      
      const freshUserDoc = await transaction.get(userRef);
      if (!freshUserDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }
      
      const freshUserData = freshUserDoc.data();
      const freshWithdrawalBalance = freshUserData.withdrawalBalance || 0;
      
      if (amount > freshWithdrawalBalance) {
        throw new Error('Solde insuffisant (vérification en temps réel)');
      }
      
      transaction.update(userRef, {
        withdrawalBalance: freshWithdrawalBalance - amount
      });
      
      const withdrawRequestRef = db.collection('withdrawRequests').doc(withdrawRequestId);
      transaction.set(withdrawRequestRef, {
        withdrawRequestId: withdrawRequestId,
        userId: authenticatedUserId,
        username: username || freshUserData.username || 'N/A',
        email: email || freshUserData.email || 'N/A',
        fullName: fullName,
        accountNumber: accountNumber,
        whatsappNumber: whatsappNumber,
        amount: amount,
        paymentMethod: paymentMethod,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const transactionRef = db.collection('fapshiTransactions').doc();
      transaction.set(transactionRef, {
        userId: authenticatedUserId,
        date: admin.firestore.FieldValue.serverTimestamp(),
        type: 'Demande de retrait',
        label: `Demande de retrait - ${paymentMethod}`,
        amount: amount,
        status: 'pending',
        withdrawRequestId: withdrawRequestId
      });
    });
    
    if (clientTwilio && TWILIO_WHATSAPP_NUMBER && ADMIN_WHATSAPP_NUMBER) {
      try {
        const messageLines = [
          '💰 *NOUVELLE DEMANDE DE RETRAIT*',
          '',
          `📋 *ID:* ${withdrawRequestId}`,
          `👤 *Utilisateur:* ${username || userData.username || 'N/A'}`,
          `📧 *Email:* ${email || userData.email || 'N/A'}`,
          '',
          '━━━━━━━━━━━━━━━━━━━━━━',
          '*INFORMATIONS DE PAIEMENT*',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `👤 *Nom complet:* ${fullName}`,
          `📱 *N° Compte:* ${accountNumber}`,
          `📞 *WhatsApp:* ${whatsappNumber}`,
          `💳 *Méthode:* ${paymentMethod}`,
          `💵 *Montant:* ${amount.toLocaleString('fr-FR')} FCFA`,
          '',
          '━━━━━━━━━━━━━━━━━━━━━━',
          `📊 *Solde avant:* ${withdrawalBalance.toLocaleString('fr-FR')} FCFA`,
          `📊 *Solde après:* ${(withdrawalBalance - amount).toLocaleString('fr-FR')} FCFA`,
          `📅 *Date:* ${new Date().toLocaleString('fr-FR')}`,
          '',
          '⚠️ *Action requise:* Contactez le client pour valider le retrait'
        ];
        
        await clientTwilio.messages.create({
          body: messageLines.join('\n'),
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`
        });
        
        console.log('✅ Notification WhatsApp envoyée pour demande de retrait:', withdrawRequestId);
      } catch (twilioErr) {
        console.warn('⚠️ Notification WhatsApp échouée (retrait):', twilioErr.message);
      }
    } else {
      console.warn('⚠️ Twilio non configuré - notification de retrait non envoyée');
    }
    
    console.log(`✅ Demande de retrait créée: ${withdrawRequestId} - ${amount} FCFA`);
    
    res.json({ 
      success: true, 
      message: 'Demande de retrait envoyée avec succès',
      requestId: withdrawRequestId
    });
    
  } catch (err) {
    console.error('❌ Erreur demande de retrait:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ENDPOINT UPDATE PROFILE (Modification securisee du profil) ─────────────

app.post('/api/update-profile', async (req, res) => {
  try {
    console.log('>>> Update profile request received');
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token d\'authentification requis' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (tokenErr) {
      console.error('❌ Token verification failed:', tokenErr.message);
      return res.status(401).json({ success: false, error: 'Token invalide ou expire' });
    }
    
    const authenticatedUserId = decodedToken.uid;
    const { userId, displayName, phone, email, newPassword, photoURL, country } = req.body;
    
    if (userId !== authenticatedUserId) {
      console.error(`❌ User ${authenticatedUserId} tried to update profile of ${userId}`);
      return res.status(403).json({ success: false, error: 'Non autorise a modifier ce profil' });
    }
    
    const ALLOWED_PROFILE_PHOTOS = [
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/49391629-jeune-homme-avatar-personnage-du-avatar-homme-icone-dessin-anime-illustration-gratuit-vectoriel.jpg",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%201.png",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%202.jpg",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%203.png",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%204.jpeg",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/femme%205.jpeg",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/illustration-du-jeune-homme-souriant_1308-174669.jpg",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/man-with-beard-avatar-character-isolated-icon-free-vector.jpg",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/pngtree-man-avatar-image-for-profile-png-image_13001877.png",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/pngtree-man-avatar-image-for-profile-png-image_13001882.png",
      "https://raw.githubusercontent.com/exaucenapopolo/Social-Boost-Horizon-/refs/heads/main/assets/Photo/figure-detaillee-vieil-homme-tenant-lettre_1077802-376424.jpg"
    ];

    const ALLOWED_COUNTRIES = ['bj','bf','cm','ca','cf','cg','ci','ga','ke','mw','ne','ng','ug','cd','rw','sn','tz','tg','zm','other',''];
    
    const db = getDB();
    const userRef = db.collection('users').doc(authenticatedUserId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouve' });
    }
    
    const currentData = userDoc.data();
    const firestoreUpdates = {};
    const authUpdates = {};
    
    if (displayName !== undefined && displayName !== currentData.username) {
      firestoreUpdates.username = displayName;
      authUpdates.displayName = displayName;
    }
    
    if (phone !== undefined && phone !== currentData.phone) {
      firestoreUpdates.phone = phone;
    }

    if (country !== undefined && country !== currentData.country) {
      if (ALLOWED_COUNTRIES.includes(country)) {
        firestoreUpdates.country = country;
      }
    }
    
    if (email !== undefined && email !== currentData.email) {
      firestoreUpdates.email = email;
      authUpdates.email = email;
    }
    
    if (newPassword && newPassword.length >= 6) {
      authUpdates.password = newPassword;
    }
    
    // Gestion de la photo de profil
    if (photoURL !== undefined && photoURL !== currentData.photoURL) {
      if (photoURL === null || photoURL === '') {
        firestoreUpdates.photoURL = null;
      } else if (ALLOWED_PROFILE_PHOTOS.includes(photoURL)) {
        firestoreUpdates.photoURL = photoURL;
        authUpdates.photoURL = photoURL;
      } else if (photoURL.startsWith('https://res.cloudinary.com/')) {
        firestoreUpdates.photoURL = photoURL;
        authUpdates.photoURL = photoURL;
      } else {
        return res.status(400).json({ success: false, error: 'Photo de profil non autorisee' });
      }
    }
    
    if (Object.keys(firestoreUpdates).length === 0 && Object.keys(authUpdates).length === 0) {
      return res.json({ success: true, message: 'Aucune modification', noChanges: true });
    }
    
    if (Object.keys(authUpdates).length > 0) {
      try {
        await admin.auth().updateUser(authenticatedUserId, authUpdates);
        console.log(`✅ Firebase Auth updated for user ${authenticatedUserId}`);
      } catch (authErr) {
        console.error('❌ Erreur Firebase Auth update:', authErr);
        if (authErr.code === 'auth/email-already-exists') {
          return res.status(400).json({ success: false, error: 'Cet email est deja utilise par un autre compte' });
        }
        if (authErr.code === 'auth/invalid-email') {
          return res.status(400).json({ success: false, error: 'Email invalide' });
        }
        if (authErr.code === 'auth/weak-password') {
          return res.status(400).json({ success: false, error: 'Mot de passe trop faible (minimum 6 caracteres)' });
        }
        return res.status(500).json({ success: false, error: 'Erreur mise a jour authentification: ' + authErr.message });
      }
    }
    
    if (Object.keys(firestoreUpdates).length > 0) {
      firestoreUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      await userRef.update(firestoreUpdates);
      console.log(`✅ Firestore updated for user ${authenticatedUserId}:`, firestoreUpdates);
    }
    
    res.json({ 
      success: true, 
      message: 'Profil mis a jour avec succes',
      updatedFields: [...Object.keys(firestoreUpdates), ...Object.keys(authUpdates).filter(k => k !== 'password')]
    });
    
  } catch (err) {
    console.error('❌ Erreur /api/update-profile:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur: ' + err.message });
  }
});

// ─── ENDPOINT: Charger le profil utilisateur ────────────────────────────────
app.get('/api/user/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token requis' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const db = getDB();
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouve' });
    }

    const data = userDoc.data();

    const [ordersSnap, autoOrdersSnap, advancedOrdersSnap, firebaseUser] = await Promise.all([
      db.collection('commandes').where('userId', '==', uid).get(),
      db.collection('autoOrders').where('userId', '==', uid).get(),
      db.collection('advancedOrders').where('userId', '==', uid).get(),
      admin.auth().getUser(uid)
    ]);

    const totalOrders = ordersSnap.size + autoOrdersSnap.size + advancedOrdersSnap.size;

    const userCountry = (data.country || 'CM').toUpperCase();
    const currencyConfig = CURRENCY_CONFIG[userCountry] || CURRENCY_CONFIG['CM'];
    const balanceXAF = data.balance || 0;
    const balanceLocal = convertFromXAF(balanceXAF, userCountry);

    res.json({
      success: true,
      profile: {
        displayName: firebaseUser.displayName || data.username || 'Utilisateur',
        email: firebaseUser.email || data.email || '',
        phone: data.phone || '',
        country: data.country || '',
        photoURL: data.photoURL || null,
        balance: balanceLocal,
        balanceXAF: balanceXAF,
        currency: currencyConfig.symbol,
        currencyCode: currencyConfig.currency,
        resellerLevel: data.resellerLevel || null,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        totalOrders: totalOrders,
        ordersStandard: ordersSnap.size,
        ordersAuto: autoOrdersSnap.size,
        ordersAdvanced: advancedOrdersSnap.size,
        settings: data.settings || {},
        lastSignIn: firebaseUser.metadata.lastSignInTime || null
      }
    });
  } catch (err) {
    console.error('Erreur /api/user/profile:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── ENDPOINT: Sauvegarder les parametres utilisateur ─────────────────────
app.post('/api/user/settings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token requis' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Parametres invalides' });
    }

    const VALID_KEYS = [
      'emailNotifications', 'whatsappNotifications', 'promoNotifications',
      'profileVisible', 'hideBalance', 'privateHistory',
      'defaultSpeed', 'confirmOrder', 'soundsAnimations'
    ];

    const sanitized = {};
    for (const key of VALID_KEYS) {
      if (key in settings && typeof settings[key] === 'boolean') {
        sanitized[key] = settings[key];
      }
    }

    const db = getDB();
    await db.collection('users').doc(uid).update({
      settings: sanitized,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: 'Parametres sauvegardes', settings: sanitized });
  } catch (err) {
    console.error('Erreur /api/user/settings:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── ENDPOINT: Charger les parametres utilisateur (GET) ───────────────────
app.get('/api/user/settings', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token requis' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const db = getDB();
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouve' });
    }

    const data = userDoc.data();
    res.json({ success: true, settings: data.settings || {} });
  } catch (err) {
    console.error('Erreur GET /api/user/settings:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── ENDPOINTS FAPSHI (Paiement Cameroun) ─────────────────────────────────

// Configuration Fapshi
const FAPSHI_CONFIG = {
  apiUrl: 'https://live.fapshi.com/initiate-pay',
  webhookUrl: 'https://social-boost-exaucenapopolo2.replit.app/webhooks/fapshi'
};

// Créer un lien de paiement Fapshi
app.post('/api/create-fapshi-checkout', async (req, res) => {
  try {
    console.log('>>> Fapshi create-checkout request received');
    
    const API_USER = process.env.FAPSHI_API_USER;
    const SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
    
    if (!API_USER || !SECRET_KEY) {
      console.error('❌ Fapshi: Clés API manquantes');
      return res.status(500).json({ error: 'Configuration Fapshi incomplète. Contactez l\'administrateur.' });
    }
    
    const { amount, currency, description, redirectUrl, externalId } = req.body;
    
    if (!amount || !currency || !redirectUrl || !externalId) {
      return res.status(400).json({ error: 'Paramètres manquants: amount, currency, redirectUrl ou externalId' });
    }
    
    const payload = {
      amount: parseInt(amount),
      currency: currency || 'XAF',
      message: description || 'Paiement Social Boost Horizon',
      redirect_url: redirectUrl,
      webhook_url: FAPSHI_CONFIG.webhookUrl,
      external_id: externalId
    };
    
    console.log('>>> Fapshi payload:', JSON.stringify(payload));
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    try {
      const fapshiResponse = await fetch(FAPSHI_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apiuser': API_USER,
          'apikey': SECRET_KEY
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      const rawText = await fapshiResponse.text();
      console.log('>>> Fapshi raw response:', fapshiResponse.status, rawText);
      
      let respJson;
      try {
        respJson = JSON.parse(rawText);
      } catch (parseErr) {
        console.error('❌ Fapshi: Réponse non-JSON:', rawText);
        return res.status(502).json({ error: 'Réponse invalide du processeur de paiement' });
      }
      
      if (!fapshiResponse.ok) {
        console.error('❌ Fapshi API error:', respJson);
        return res.status(fapshiResponse.status).json({ error: respJson.message || 'Erreur Fapshi' });
      }
      
      const checkoutUrl = respJson.link || respJson.data?.url;
      const fapshiTransId = respJson.transId || null;
      
      if (!checkoutUrl) {
        console.error('❌ Fapshi: Pas d\'URL de paiement dans la réponse:', respJson);
        return res.status(502).json({ error: 'URL de paiement non reçue' });
      }
      
      // Enregistrer la transaction dans Firestore
      const transactionDocId = fapshiTransId || `fapshi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await getDB().collection('fapshiTransactions').doc(transactionDocId).set({
        fapshiTransId: fapshiTransId,
        userId: externalId,
        amount: parseInt(amount),
        currency: currency || 'XAF',
        status: 'PENDING',
        dateInitiated: admin.firestore.FieldValue.serverTimestamp(),
        checkoutUrl: checkoutUrl
      });
      
      console.log(`✅ Fapshi: Transaction ${transactionDocId} créée pour user ${externalId}`);
      
      res.json({ checkoutUrl, transactionId: transactionDocId });
      
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('❌ Fapshi: Timeout');
        return res.status(504).json({ error: 'Timeout de connexion à Fapshi' });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    
  } catch (err) {
    console.error('❌ Erreur /api/create-fapshi-checkout:', err);
    res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
});

// Webhook Fapshi
app.post('/webhooks/fapshi', async (req, res) => {
  try {
    console.log('>>> Fapshi webhook received:', JSON.stringify(req.body));
    
    const { status, amount, transId } = req.body;
    
    // Normaliser le statut (Fapshi peut envoyer en majuscules ou minuscules)
    const normalizedStatus = (status || '').toUpperCase();
    
    if (normalizedStatus !== 'SUCCESSFUL') {
      console.log(`>>> Fapshi: Transaction ${transId} status: ${status} (ignorée)`);
      return res.status(200).json({ message: 'Transaction non réussie ignorée' });
    }
    
    if (!transId || isNaN(amount)) {
      console.error('❌ Fapshi webhook: Données invalides - transId:', transId, 'amount:', amount);
      return res.status(400).json({ error: 'Données invalides' });
    }
    
    const db = getDB();
    
    // D'abord chercher par ID du document
    let fapshiTransRef = db.collection('fapshiTransactions').doc(transId);
    let fapshiTransDoc = await fapshiTransRef.get();
    
    // Si non trouvé, chercher par le champ fapshiTransId
    if (!fapshiTransDoc.exists) {
      console.log(`>>> Fapshi: Transaction ${transId} non trouvée par ID, recherche par champ fapshiTransId...`);
      
      const querySnapshot = await db.collection('fapshiTransactions')
        .where('fapshiTransId', '==', transId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        fapshiTransDoc = querySnapshot.docs[0];
        fapshiTransRef = fapshiTransDoc.ref;
        console.log(`>>> Fapshi: Transaction trouvée par fapshiTransId: ${fapshiTransDoc.id}`);
      }
    }
    
    if (!fapshiTransDoc.exists) {
      console.error(`❌ Fapshi: Transaction ${transId} non trouvée dans fapshiTransactions`);
      return res.status(200).json({ message: 'Transaction inconnue ignorée' });
    }
    
    const transactionData = fapshiTransDoc.data();
    const userId = transactionData.userId;
    
    console.log(`>>> Fapshi: Transaction ${transId} trouvée - userId: ${userId}, status actuel: ${transactionData.status}`);
    
    // Vérifier si déjà traité pour éviter les doublons
    if (transactionData.status === 'CONFIRMED') {
      console.log(`>>> Fapshi: Transaction ${transId} déjà confirmée, ignorée`);
      return res.status(200).json({ message: 'Transaction déjà traitée' });
    }
    
    if (!userId) {
      console.error(`❌ Fapshi: userId manquant pour transaction ${transId}`);
      return res.status(500).json({ error: 'userId manquant' });
    }
    
    // Marquer la transaction comme confirmée
    await fapshiTransRef.update({
      status: 'CONFIRMED',
      dateConfirmed: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`>>> Fapshi: Transaction ${transId} marquée comme CONFIRMED`);
    
    // Mettre à jour le solde de l'utilisateur
    const userRef = db.collection('users').doc(userId);
    const parsedAmount = parseInt(amount);
    
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      
      if (!userDoc.exists) {
        t.set(userRef, { balance: parsedAmount });
      } else {
        const currentBalance = userDoc.data().balance || 0;
        t.update(userRef, { balance: currentBalance + parsedAmount });
      }
    });
    
    console.log(`✅ Fapshi: Solde mis à jour pour ${userId}: +${parsedAmount} FCFA`);
    
    // Bonus parrainage (5%)
    const filleulDoc = await userRef.get();
    if (filleulDoc.exists) {
      const filleulData = filleulDoc.data();
      const parrainUid = filleulData?.referredBy;
      
      if (parrainUid) {
        const bonusParrain = Math.floor(parsedAmount * 0.05);
        
        if (bonusParrain > 0) {
          const parrainRef = db.collection('users').doc(parrainUid);
          
          await parrainRef.set({
            referralBalance: admin.firestore.FieldValue.increment(bonusParrain)
          }, { merge: true });
          
          await parrainRef.collection('referrals').add({
            refereeUid: userId,
            amount: parsedAmount,
            bonus: bonusParrain,
            type: 'deposit_bonus_fapshi',
            transactionId: transId,
            date: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed'
          });
          
          console.log(`🎁 Fapshi: Bonus parrainage ${bonusParrain} FCFA pour ${parrainUid}`);
        }
      }
    }
    
    res.status(200).json({ message: 'Webhook traité avec succès' });
    
  } catch (err) {
    console.error('❌ Erreur webhook Fapshi:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── TESTER LE RAPPORT HEBDOMADAIRE (ENDPOINT TEST) ─────────────────────
app.get('/api/test-weekly-report', async (req, res) => {
  try {
    console.log('🧪 Test manuel du rapport hebdomadaire...');
    
    // Appeler la fonction d'envoi du rapport
    await sendWeeklyReport();
    
    res.json({ 
      success: true, 
      message: 'Rapport hebdomadaire envoyé avec succès ! Vérifiez vos SMS.',
      info: 'Le rapport a été envoyé au numéro Twilio configuré.'
    });
  } catch (err) {
    console.error('❌ Erreur test rapport hebdomadaire:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API: RÉCUPÉRER LES FILLEULS D'UN UTILISATEUR ────────────────────────
app.get('/api/referrals/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const db = getDB();
    
    // Chercher tous les utilisateurs qui ont referredBy == userId
    const usersSnapshot = await db.collection('users')
      .where('referredBy', '==', userId)
      .get();
    
    const referrals = [];
    let totalEarnings = 0;
    
    // Récupérer aussi les bonus depuis la sous-collection referrals
    const referralsSubSnapshot = await db.collection('users').doc(userId)
      .collection('referrals').get();
    
    const bonusMap = {};
    referralsSubSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.refereeUid) {
        bonusMap[data.refereeUid] = (bonusMap[data.refereeUid] || 0) + (data.bonus || 0);
      }
      totalEarnings += data.bonus || 0;
    });
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const refereeUid = doc.id;
      referrals.push({
        id: refereeUid,
        username: userData.username || 'Utilisateur',
        email: userData.email || '',
        country: userData.pays || userData.country || '',
        joinedAt: userData.createdAt || null,
        bonus: bonusMap[refereeUid] || 0
      });
    });
    
    // Trier par date d'inscription (les plus récents en premier)
    referrals.sort((a, b) => {
      const dateA = a.joinedAt?.toDate?.() || new Date(0);
      const dateB = b.joinedAt?.toDate?.() || new Date(0);
      return dateB - dateA;
    });
    
    res.json({
      success: true,
      totalReferrals: referrals.length,
      totalEarnings: totalEarnings,
      referrals: referrals
    });
    
  } catch (err) {
    console.error('❌ Erreur récupération filleuls:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ADMIN: MISE À JOUR PARRAINAGE EN MASSE ─────────────────────────────
app.get('/api/admin/update-referrals/:targetUserId', async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const db = getDB();
    
    // Vérifier que l'utilisateur cible existe
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur cible non trouvé' });
    }
    
    const targetUserData = targetUserDoc.data();
    console.log(`\n🔄 Mise à jour parrainage vers: ${targetUserData.email || targetUserData.username}`);
    
    // Trouver tous les utilisateurs qui ont passé des commandes
    const commandesSnapshot = await db.collection('commandes').get();
    const usersWithOrders = new Set();
    
    commandesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.userId && data.userId !== targetUserId) {
        usersWithOrders.add(data.userId);
      }
    });
    
    // Trouver tous les utilisateurs qui ont fait des dépôts (recharges validées)
    const rechargesSnapshot = await db.collection('recharges').where('status', '==', 'validated').get();
    
    rechargesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.userId && data.userId !== targetUserId) {
        usersWithOrders.add(data.userId);
      }
    });
    
    // Trouver les paiements Fapshi réussis
    const fapshiSnapshot = await db.collection('fapshiTransactions').where('status', '==', 'SUCCESSFUL').get();
    
    fapshiSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.userId && data.userId !== targetUserId) {
        usersWithOrders.add(data.userId);
      }
    });
    
    console.log(`📊 Utilisateurs actifs trouvés: ${usersWithOrders.size}`);
    
    // Mettre à jour le champ referredBy pour chaque utilisateur
    let updatedCount = 0;
    let alreadyLinkedCount = 0;
    let errorCount = 0;
    const updatedUsers = [];
    const alreadyLinkedUsers = [];
    
    for (const userId of usersWithOrders) {
      try {
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          
          // Vérifier si déjà lié au bon parrain
          if (userData.referredBy === targetUserId) {
            alreadyLinkedCount++;
            alreadyLinkedUsers.push({
              id: userId,
              email: userData.email || 'N/A',
              username: userData.username || 'N/A'
            });
          } else {
            // Mettre à jour le referredBy
            await userRef.update({
              referredBy: targetUserId,
              referredByUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            updatedCount++;
            updatedUsers.push({
              id: userId,
              email: userData.email || 'N/A',
              username: userData.username || 'N/A',
              previousReferredBy: userData.referredBy || 'aucun'
            });
            console.log(`✅ ${userData.email || userId}: referredBy mis à jour`);
          }
        }
      } catch (err) {
        console.error(`❌ Erreur pour ${userId}:`, err.message);
        errorCount++;
      }
    }
    
    const report = {
      success: true,
      targetUser: {
        id: targetUserId,
        email: targetUserData.email,
        username: targetUserData.username,
        referralCode: targetUserData.referralCode
      },
      summary: {
        totalActiveUsers: usersWithOrders.size,
        updatedCount: updatedCount,
        alreadyLinkedCount: alreadyLinkedCount,
        errorCount: errorCount
      },
      updatedUsers: updatedUsers,
      alreadyLinkedUsers: alreadyLinkedUsers
    };
    
    console.log('\n📋 RAPPORT DE MISE À JOUR PARRAINAGE:');
    console.log(`   - Utilisateurs actifs: ${usersWithOrders.size}`);
    console.log(`   - Mis à jour: ${updatedCount}`);
    console.log(`   - Déjà liés: ${alreadyLinkedCount}`);
    console.log(`   - Erreurs: ${errorCount}`);
    
    res.json(report);
    
  } catch (err) {
    console.error('❌ Erreur mise à jour parrainage:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── MORETHANPANEL API INTEGRATION ──────────────────────────────────────────
// Configuration MoreThanPanel
const MORETHANPANEL_CONFIG = {
  apiUrl: 'https://morethanpanel.com/api/v2',
  apiKey: process.env.MORETHANPANEL_API_KEY,
  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPLICATEUR DE PRIX - Modifiez cette valeur pour changer votre marge
  // Exemple: 4 = prix fournisseur × 4, donc 3 = ×3, 5 = ×5, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  priceMultiplier: 3,
  usdToXafRate: 615 // Taux de conversion USD vers XAF (ne pas modifier)
};

// Cache des services MTP pour calcul de prix côté serveur
let mtpServicesCache = {
  services: [],
  lastFetch: null,
  cacheTTL: 5 * 60 * 1000 // 5 minutes
};

// ─── SMMGEN API INTEGRATION ──────────────────────────────────────────────────
// Configuration SMMGen (Second fournisseur commandes automatiques)
const SMMGEN_CONFIG = {
  apiUrl: 'https://smmgen.com/api/v2',
  apiKey: process.env.SMMGEN_API_KEY,
  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPLICATEUR DE PRIX - 3.5x pour SMMGen
  // ═══════════════════════════════════════════════════════════════════════════
  priceMultiplier: 3.5,
  usdToXafRate: 615 // Taux de conversion USD vers XAF
};

// Cache des services SMMGen pour calcul de prix côté serveur
let smmgenServicesCache = {
  services: [],
  lastFetch: null,
  cacheTTL: 5 * 60 * 1000 // 5 minutes
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION EXOSUPPLIER - Pour commandes standards automatisées
// ═══════════════════════════════════════════════════════════════════════════
const EXOSUPPLIER_CONFIG = {
  apiUrl: 'https://exosupplier.com/api/v2',
  apiKey: process.env.EXOSUPPLIER_API_KEY,
  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPLICATEUR DE PRIX - Modifiez cette valeur pour changer votre marge
  // Exemple: 2 = prix fournisseur × 2
  // ═══════════════════════════════════════════════════════════════════════════
  priceMultiplier: 2,
  usdToXafRate: 615 // Taux de conversion USD vers XAF
};

// Cache des services ExoSupplier
let exoServicesCache = {
  services: [],
  lastFetch: null,
  cacheTTL: 10 * 60 * 1000 // 10 minutes
};

// Fonction helper pour appeler l'API ExoSupplier
async function callExoSupplierAPI(params) {
  const formData = new URLSearchParams();
  formData.append('key', EXOSUPPLIER_CONFIG.apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value);
  }
  
  try {
    const response = await fetch(EXOSUPPLIER_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('ExoSupplier API response parse error:', text);
      return { error: 'Réponse invalide du fournisseur' };
    }
  } catch (error) {
    console.error('ExoSupplier API error:', error);
    return { error: error.message };
  }
}

// Récupérer les services ExoSupplier (avec cache)
async function getExoSupplierServices() {
  const now = Date.now();
  if (exoServicesCache.services.length > 0 && 
      exoServicesCache.lastFetch && 
      (now - exoServicesCache.lastFetch) < exoServicesCache.cacheTTL) {
    return exoServicesCache.services;
  }
  
  try {
    const services = await callExoSupplierAPI({ action: 'services' });
    if (Array.isArray(services)) {
      exoServicesCache.services = services;
      exoServicesCache.lastFetch = now;
      console.log(`✅ ${services.length} services ExoSupplier chargés en cache`);
      return services;
    }
    return exoServicesCache.services; // Retourner le cache existant en cas d'erreur
  } catch (error) {
    console.error('Erreur chargement services ExoSupplier:', error);
    return exoServicesCache.services;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT API - Récupérer les services ExoSupplier formatés pour le frontend
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/exo-services', async (req, res) => {
  try {
    const services = await getExoSupplierServices();
    
    if (!services || services.length === 0) {
      return res.status(500).json({ success: false, error: 'Impossible de charger les services' });
    }
    
    // Mapping des catégories ExoSupplier vers nos plateformes
    const categoryToPlatform = {
      'tiktok': 'tiktok',
      'instagram': 'instagram',
      'facebook': 'facebook',
      'youtube': 'youtube',
      'telegram': 'telegram',
      'twitter': 'twitter',
      'whatsapp': 'whatsapp',
      'snapchat': 'snapchat',
      'spotify': 'spotify',
      'linkedin': 'linkedin',
      'threads': 'threads',
      'pinterest': 'pinterest',
      'discord': 'discord',
      'twitch': 'twitch',
      'soundcloud': 'soundcloud',
      'shazam': 'shazam'
    };
    
    // Grouper les services par plateforme
    const servicesByPlatform = {};
    
    services.forEach(service => {
      // Déterminer la plateforme à partir de la catégorie
      const categoryLower = (service.category || '').toLowerCase();
      let platform = null;
      
      for (const [key, value] of Object.entries(categoryToPlatform)) {
        if (categoryLower.includes(key)) {
          platform = value;
          break;
        }
      }
      
      // Si pas de plateforme détectée, essayer avec le nom du service
      if (!platform) {
        const nameLower = (service.name || '').toLowerCase();
        for (const [key, value] of Object.entries(categoryToPlatform)) {
          if (nameLower.includes(key)) {
            platform = value;
            break;
          }
        }
      }
      
      // Ignorer les services sans plateforme identifiable
      if (!platform) return;
      
      // Initialiser la plateforme si nécessaire
      if (!servicesByPlatform[platform]) {
        servicesByPlatform[platform] = [];
      }
      
      // Calculer le prix en XAF avec notre multiplicateur
      const priceUSD = parseFloat(service.rate) || 0;
      const priceXAF = priceUSD * EXOSUPPLIER_CONFIG.usdToXafRate * EXOSUPPLIER_CONFIG.priceMultiplier;
      
      // Déterminer si c'est un package (prix par unité) ou standard (prix pour 1000)
      const isPackage = service.type === 'Package' || 
                       (service.name && service.name.toLowerCase().includes('package'));
      
      // Utiliser isPerOneService pour détecter tous les services facturés par unité
      const isPerOne = isPerOneService(service);
      
      // Déterminer si c'est un service de commentaires personnalisés
      const isCustomComments = service.type === 'Custom Comments' || 
                              (service.name && (
                                service.name.toLowerCase().includes('custom comment') ||
                                service.name.toLowerCase().includes('commentaires personnalis')
                              ));
      
      servicesByPlatform[platform].push({
        id: service.service,
        name: service.name,
        category: service.category,
        type: service.type || 'Default',
        priceXAF: Math.round(priceXAF * 100) / 100,
        min: parseInt(service.min) || 1,
        max: parseInt(service.max) || 1000000,
        refill: service.refill === true || service.refill === 'true',
        cancel: service.cancel === true || service.cancel === 'true',
        isPackage: isPackage,
        isPerOne: isPerOne,
        isCustomComments: isCustomComments,
        description: service.desc || service.description || '',
        averageTime: service.average_time || service.dripfeed ? 'Variable' : 'Rapide'
      });
    });
    
    // Trier les services par nom dans chaque plateforme
    for (const platform in servicesByPlatform) {
      servicesByPlatform[platform].sort((a, b) => a.name.localeCompare(b.name));
    }
    
    res.json({ 
      success: true, 
      platforms: servicesByPlatform,
      totalServices: services.length,
      multiplier: EXOSUPPLIER_CONFIG.priceMultiplier
    });
    
  } catch (error) {
    console.error('Erreur API exo-services:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT API - Passer une commande ExoSupplier directement
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/order-exo', authenticateToken, async (req, res) => {
  try {
    const { exoServiceId, link, quantity, comments, contactType, contact } = req.body;
    const isResellerOrder = req.body.isResellerOrder === true || req.body.isResellerOrder === 'true';
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Non authentifié' });
    }
    
    if (!exoServiceId || !link) {
      return res.status(400).json({ success: false, error: 'Service et lien requis' });
    }
    
    // Récupérer les infos du service ExoSupplier
    const exoServices = await getExoSupplierServices();
    const exoService = exoServices.find(s => String(s.service) === String(exoServiceId));
    
    if (!exoService) {
      return res.status(400).json({ success: false, error: 'Service ExoSupplier non trouvé' });
    }
    
    // Calculer le prix de base
    const priceUSD = parseFloat(exoService.rate) || 0;
    const priceXAFper1000 = priceUSD * EXOSUPPLIER_CONFIG.usdToXafRate * EXOSUPPLIER_CONFIG.priceMultiplier;
    const isPackage = exoService.type === 'Package';
    const isPerOne = isPerOneService(exoService); // Détection améliorée des services par unité
    const isCustomComments = exoService.type === 'Custom Comments';
    
    let qty = quantity;
    if (isCustomComments && Array.isArray(comments)) {
      qty = comments.length;
    }
    qty = parseInt(qty) || 1;
    
    // Valider la quantité
    const minQty = parseInt(exoService.min) || 1;
    const maxQty = parseInt(exoService.max) || 1000000;
    
    if (qty < minQty) {
      return res.status(400).json({ success: false, error: `Quantité minimum: ${minQty}` });
    }
    if (qty > maxQty) {
      return res.status(400).json({ success: false, error: `Quantité maximum: ${maxQty}` });
    }
    
    // Calculer le prix total
    // Pour les services "par 1" (packages, partages, story views, etc.): prix × quantité
    // Pour les services "par 1000": (prix/1000) × quantité
    let totalPriceXAF;
    if (isPerOne || isPackage) {
      totalPriceXAF = priceXAFper1000 * qty;
    } else {
      totalPriceXAF = (priceXAFper1000 / 1000) * qty;
    }
    totalPriceXAF = Math.round(totalPriceXAF * 100) / 100;
    
    // Récupérer l'utilisateur
    const userRef = getDB().collection('users').doc(userId);
    const userSnap = await userRef.get();
    
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }
    
    const userData = userSnap.data();
    const currentBalance = userData.balance || 0;
    
    // Appliquer la remise revendeur si applicable
    let discountRate = 0;
    let discountAmount = 0;
    let finalPriceXAF = totalPriceXAF;
    
    if (isResellerOrder && userData.isReseller && userData.discountRate > 0) {
      discountRate = userData.discountRate;
      discountAmount = Math.round(totalPriceXAF * (discountRate / 100) * 100) / 100;
      finalPriceXAF = Math.round((totalPriceXAF - discountAmount) * 100) / 100;
      console.log(`🏷️ Remise revendeur appliquée: ${discountRate}% = -${discountAmount} FCFA`);
    }
    
    if (currentBalance < finalPriceXAF) {
      return res.status(400).json({ success: false, error: 'Solde insuffisant' });
    }
    
    // Générer le numéro de commande séquentiel SBH-XXXX
    const counterRef = getDB().collection('counters').doc('orders');
    const counterSnap = await counterRef.get();
    let orderNumber = 2500; // Commencer à 2500
    
    if (counterSnap.exists) {
      orderNumber = (counterSnap.data().current || 2499) + 1;
    }
    
    // Mettre à jour le compteur
    await counterRef.set({ current: orderNumber }, { merge: true });
    
    const orderId = `SBH-${orderNumber}`;
    const orderDocRef = getDB().collection('commandes').doc(orderId);
    
    // Transaction pour débiter et créer la commande
    await getDB().runTransaction(async (transaction) => {
      const freshUserSnap = await transaction.get(userRef);
      const freshBalance = freshUserSnap.data().balance || 0;
      
      if (freshBalance < finalPriceXAF) {
        throw new Error('Solde insuffisant');
      }
      
      // Déterminer la plateforme depuis la catégorie
      const categoryLower = (exoService.category || '').toLowerCase();
      let platform = 'autre';
      const platforms = ['tiktok', 'instagram', 'facebook', 'youtube', 'telegram', 'twitter', 'whatsapp', 'spotify', 'linkedin'];
      for (const p of platforms) {
        if (categoryLower.includes(p) || (exoService.name || '').toLowerCase().includes(p)) {
          platform = p;
          break;
        }
      }
      
      // Créer la commande
      transaction.set(orderDocRef, {
        orderId,
        userId,
        platform,
        service: exoService.name,
        exoServiceId: parseInt(exoServiceId),
        exoServiceName: exoService.name,
        quantity: qty,
        comments: isCustomComments ? comments : null,
        link,
        originalPrice: totalPriceXAF,
        discountRate: discountRate,
        discountAmount: discountAmount,
        finalCost: finalPriceXAF,
        priceXAFper1000,
        contactType: contactType || 'whatsapp',
        contact: contact || '',
        status: 'En attente',
        isAutoOrder: true,
        isResellerOrder: isResellerOrder && discountRate > 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Débiter le solde
      transaction.update(userRef, {
        balance: admin.firestore.FieldValue.increment(-finalPriceXAF),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Si c'est une commande revendeur, mettre à jour les stats
      if (isResellerOrder && discountRate > 0) {
        transaction.update(userRef, {
          resellerWeeklyOrders: admin.firestore.FieldValue.increment(1),
          totalSavings: admin.firestore.FieldValue.increment(discountAmount)
        });
      }
    });
    
    // Envoyer la commande à ExoSupplier
    try {
      const exoParams = {
        action: 'add',
        service: exoServiceId,
        link: link,
        quantity: qty
      };
      
      if (isCustomComments && Array.isArray(comments) && comments.length > 0) {
        exoParams.comments = comments.join('\n');
      }
      
      const exoResult = await callExoSupplierAPI(exoParams);
      
      if (exoResult.order) {
        await orderDocRef.update({
          exoOrderId: exoResult.order,
          exoStatus: 'Pending',
          status: 'en cours',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`✅ Commande ExoSupplier #${exoResult.order} créée pour service ${exoServiceId}`);
      } else {
        console.error('❌ Erreur ExoSupplier (solde fournisseur insuffisant?):', exoResult.error || 'Réponse invalide');
        await userRef.update({ balance: admin.firestore.FieldValue.increment(finalPriceXAF) });
        await orderDocRef.delete();
        console.log(`💰 Remboursement revendeur de ${finalPriceXAF} XAF effectué, commande supprimée`);
        return res.status(503).json({
          success: false,
          error: 'Ce service est temporairement indisponible. Veuillez réessayer plus tard ou contacter un administrateur.',
          adminContact: '+237699853665',
          refunded: true
        });
      }
    } catch (exoError) {
      console.error('❌ Erreur appel ExoSupplier:', exoError.message);
      await userRef.update({ balance: admin.firestore.FieldValue.increment(finalPriceXAF) });
      await orderDocRef.delete();
      console.log(`💰 Remboursement revendeur de ${finalPriceXAF} XAF effectué suite à erreur fournisseur`);
      return res.status(503).json({
        success: false,
        error: 'Ce service est temporairement indisponible. Veuillez réessayer plus tard ou contacter un administrateur.',
        adminContact: '+237699853665',
        refunded: true
      });
    }
    
    const newBalance = currentBalance - finalPriceXAF;
    
    res.json({
      success: true,
      orderId,
      originalPrice: totalPriceXAF,
      discountRate: discountRate,
      discountAmount: discountAmount,
      finalCost: finalPriceXAF,
      savings: discountAmount,
      newBalance,
      service: exoService.name,
      isResellerOrder: isResellerOrder && discountRate > 0
    });
    
  } catch (error) {
    console.error('Erreur /api/order-exo:', error);
    res.status(500).json({ success: false, error: error.message || 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MAPPING DES SERVICES LOCAUX VERS EXOSUPPLIER (LEGACY - sera supprimé)
// Clé: "plateforme|service|qualité" => ID ExoSupplier
// qualité: "medium" ou "high"
// ═══════════════════════════════════════════════════════════════════════════
const EXOSUPPLIER_SERVICE_MAPPING = {
  // === TIKTOK ===
  "tiktok|Followers|medium": 3036,
  "tiktok|Followers|high": 3037,
  "tiktok|J'aime|medium": 3048,
  "tiktok|J'aime|high": 3049,
  "tiktok|Vues de videos|medium": 3047,
  "tiktok|Vues de videos|high": 3043,
  "tiktok|Partages|medium": 3054,
  "tiktok|Partages|high": 3054,
  "tiktok|Enregistrements|medium": 3051,
  "tiktok|Enregistrements|high": 3051,
  "tiktok|Commentaires personnalises|medium": 3154,
  "tiktok|Commentaires personnalises|high": 3101,
  
  // === INSTAGRAM ===
  "instagram|Followers|medium": 3106,
  "instagram|Followers|high": 3107,
  "instagram|J'aime|medium": 2997,
  "instagram|J'aime|high": 2998,
  "instagram|Vues de videos|medium": 3108,
  "instagram|Vues de videos|high": 3109,
  "instagram|Commentaires personnalises|medium": 3014,
  "instagram|Commentaires personnalises|high": 3015,
  "instagram|Vues de story|Vues story (asiatiques)|high": 3017,
  
  // === FACEBOOK ===
  "facebook|Followers (page)|medium": 3123,
  "facebook|Followers (page)|high": 3124,
  "facebook|Followers (profil)|medium": 3125,
  "facebook|Followers (profil)|high": 3126,
  "facebook|J'aime (publication)|medium": 3129,
  "facebook|J'aime (publication)|high": 3130,
  "facebook|Partages|medium": 2975,
  "facebook|Partages|high": 2975,
  "facebook|Membres de groupe|medium": 2932,
  "facebook|Membres de groupe|high": 3136,
  "facebook|Vues de video|medium": 3137,
  "facebook|Vues de video|high": 3138,
  "facebook|Reaction Emoji|Reaction Love|medium": 3131,
  "facebook|Reaction Emoji|Reaction Love|high": 3131,
  "facebook|Reaction Emoji|Reaction Coeur|medium": 3131,
  "facebook|Reaction Emoji|Reaction Coeur|high": 3131,
  "facebook|Reaction Emoji|Reaction Rire|medium": 3133,
  "facebook|Reaction Emoji|Reaction Rire|high": 3133,
  "facebook|Reaction Emoji|Reaction Wow|medium": 3132,
  "facebook|Reaction Emoji|Reaction Wow|high": 3132,
  "facebook|Reaction Emoji|Reaction Triste|medium": 3134,
  "facebook|Reaction Emoji|Reaction Triste|high": 3134,
  "facebook|Reaction Emoji|Reaction Colere|medium": 3135,
  "facebook|Reaction Emoji|Reaction Colere|high": 3135,
  
  // === YOUTUBE ===
  "youtube|Abonnes|Abonnes (Mondial)|medium": 3056,
  "youtube|Abonnes|Abonnes (Mondial)|high": 3058,
  "youtube|Vues|Vues (Mondial)|medium": 3061,
  "youtube|Vues|Vues (Mondial)|high": 3062,
  "youtube|J'aime|J'aime (Mondial)|medium": 3080,
  "youtube|J'aime|J'aime (Mondial)|high": 3149,
  "youtube|Commentaires personnalises|Commentaires (Mondial)|high": 3151,
  
  // === TELEGRAM ===
  "telegram|Membres|medium": 3143,
  "telegram|Membres|high": 3144,
  "telegram|Vues|medium": 2801,
  "telegram|Vues|high": 2801,
  
  // === TWITTER/X ===
  "twitter|J'aime|medium": 3146,
  "twitter|J'aime|high": 3145,
  "twitter|Retweets|medium": 3147,
  "twitter|Retweets|high": 3148,
  
  // === WHATSAPP ===
  "whatsapp|Membres de chaine|medium": 2880,
  "whatsapp|Membres de chaine|high": 2880
};

// Fonction pour trouver le service ExoSupplier correspondant
function findExoSupplierService(platform, serviceName, quality, subOption = null) {
  // Essayer d'abord avec subOption si disponible
  if (subOption) {
    const keyWithSub = `${platform.toLowerCase()}|${serviceName}|${subOption}|${quality}`;
    if (EXOSUPPLIER_SERVICE_MAPPING[keyWithSub]) {
      return EXOSUPPLIER_SERVICE_MAPPING[keyWithSub];
    }
  }
  
  // Sinon essayer sans subOption
  const key = `${platform.toLowerCase()}|${serviceName}|${quality}`;
  return EXOSUPPLIER_SERVICE_MAPPING[key] || null;
}

// Fonction helper pour appeler l'API MoreThanPanel
async function callMoreThanPanelAPI(params) {
  const fetch = (await import('node-fetch')).default;
  const formData = new URLSearchParams();
  formData.append('key', MORETHANPANEL_CONFIG.apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value);
  }
  
  try {
    const response = await fetch(MORETHANPANEL_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('MTP API non-JSON response:', text);
      throw new Error('Invalid API response');
    }
  } catch (error) {
    console.error('MTP API call failed:', error);
    throw error;
  }
}

// Fonction pour récupérer les services avec cache
async function getMTPServices() {
  const now = Date.now();
  if (mtpServicesCache.services.length > 0 && 
      mtpServicesCache.lastFetch && 
      (now - mtpServicesCache.lastFetch) < mtpServicesCache.cacheTTL) {
    return mtpServicesCache.services;
  }
  
  const services = await callMoreThanPanelAPI({ action: 'services' });
  if (Array.isArray(services)) {
    mtpServicesCache.services = services;
    mtpServicesCache.lastFetch = now;
  }
  return mtpServicesCache.services;
}

// Fonction pour calculer le prix côté serveur (sécurisé)
async function calculateMTPPrice(serviceId, quantity) {
  const services = await getMTPServices();
  const service = services.find(s => s.service == serviceId);
  
  if (!service) {
    throw new Error(`Service ${serviceId} non trouvé`);
  }
  
  const min = parseInt(service.min);
  const max = parseInt(service.max);
  const qty = parseInt(quantity);
  
  if (qty < min || qty > max) {
    throw new Error(`Quantité invalide. Min: ${min}, Max: ${max}`);
  }
  
  const priceUSD = parseFloat(service.rate);
  const isPerOne = isPerOneService(service); // Utilise la même fonction de détection
  const priceXAF = priceUSD * MORETHANPANEL_CONFIG.usdToXafRate * MORETHANPANEL_CONFIG.priceMultiplier;
  
  // Pour les services "par 1": prix × quantité
  // Pour les services "par 1000": (prix/1000) × quantité
  const totalPriceXAF = isPerOne 
    ? priceXAF * qty  // Par unité: prix fixe par unité
    : (priceXAF / 1000) * qty;  // Par 1000: prix par 1000
  
  return {
    service: service,
    isPerOne: isPerOne,
    isPackage: service.type === 'Package',
    priceXAF: priceXAF, // Prix de base
    totalPriceXAF: totalPriceXAF,
    quantity: qty
  };
}

// ─── SMMGEN API HELPER FUNCTIONS ─────────────────────────────────────────────

// Fonction helper pour appeler l'API SMMGen
async function callSMMGenAPI(params) {
  const fetch = (await import('node-fetch')).default;
  const formData = new URLSearchParams();
  formData.append('key', SMMGEN_CONFIG.apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value);
  }
  
  try {
    const response = await fetch(SMMGEN_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('SMMGen API non-JSON response:', text);
      throw new Error('Invalid API response');
    }
  } catch (error) {
    console.error('SMMGen API call failed:', error);
    throw error;
  }
}

// Fonction pour récupérer les services SMMGen avec cache
async function getSMMGenServices() {
  const now = Date.now();
  if (smmgenServicesCache.services.length > 0 && 
      smmgenServicesCache.lastFetch && 
      (now - smmgenServicesCache.lastFetch) < smmgenServicesCache.cacheTTL) {
    return smmgenServicesCache.services;
  }
  
  const services = await callSMMGenAPI({ action: 'services' });
  if (Array.isArray(services)) {
    smmgenServicesCache.services = services;
    smmgenServicesCache.lastFetch = now;
  }
  return smmgenServicesCache.services;
}

// Fonction pour détecter si un service est facturé "par 1" au lieu de "par 1000"
function isPerOneService(service) {
  const min = parseInt(service.min) || 0;
  const max = parseInt(service.max) || 0;

  // Packs à quantité fixe (min=max>1) : ex. WatchTime 1000 min, Monétisation 1000 min.
  // Ces services ont une quantité imposée > 1. Le prix est un forfait fixe.
  // Avec isPerOne=false : total = (priceXAF/1000) × min = priceXAF (exact).
  // Avec isPerOne=true  : total = priceXAF × 1000 = 1000× trop cher !
  if (min === max && min > 1) return false;

  // Services Package ou Custom Comments Package : prix fixe par unité
  // (ex: Discord Boost, Line OpenChat, packs Snapchat, etc.)
  if (service.type === 'Package' || service.type === 'Custom Comments Package') return true;

  // Services avec quantité très faible (max ≤ 5) : vendu par unité individuelle
  // (ex: TrustPilot Reviews × 1-5, petits packs, etc.)
  // NB: Custom Comments avec max > 5 restent en tarification par 1000 (convention SMM)
  if (min >= 1 && max > 0 && max <= 5) return true;

  return false;
}

// Fonction pour calculer le prix SMMGen côté serveur (sécurisé)
async function calculateSMMGenPrice(serviceId, quantity) {
  const services = await getSMMGenServices();
  const service = services.find(s => s.service == serviceId);
  
  if (!service) {
    throw new Error(`Service SMMGen ${serviceId} non trouvé`);
  }
  
  const min = parseInt(service.min);
  const max = parseInt(service.max);
  const qty = parseInt(quantity);
  
  if (qty < min || qty > max) {
    throw new Error(`Quantité invalide. Min: ${min}, Max: ${max}`);
  }
  
  const priceUSD = parseFloat(service.rate);
  const isPerOne = isPerOneService(service);
  const priceXAF = priceUSD * SMMGEN_CONFIG.usdToXafRate * SMMGEN_CONFIG.priceMultiplier;
  
  // Pour les services "par 1": prix × quantité
  // Pour les services "par 1000": (prix/1000) × quantité
  const totalPriceXAF = isPerOne 
    ? priceXAF * qty  // Par unité: prix fixe par unité
    : (priceXAF / 1000) * qty;  // Par 1000: prix par 1000
  
  return {
    service: service,
    isPerOne: isPerOne,
    isPackage: service.type === 'Package',
    priceXAF: priceXAF, // Prix de base
    totalPriceXAF: totalPriceXAF,
    quantity: qty
  };
}

// Middleware d'authentification Firebase pour les endpoints MTP
async function authenticateMTP(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token d\'authentification requis' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.userId = decodedToken.uid;
    req.userEmail = decodedToken.email;
    next();
  } catch (error) {
    console.error('Auth MTP error:', error);
    return res.status(401).json({ success: false, error: 'Token invalide ou expiré' });
  }
}

// GET /api/mtp/services - Récupérer tous les services MoreThanPanel
app.get('/api/mtp/services', async (req, res) => {
  try {
    console.log('📦 Récupération des services MoreThanPanel...');
    const services = await callMoreThanPanelAPI({ action: 'services' });
    
    if (!Array.isArray(services)) {
      console.error('Erreur MTP services:', services);
      return res.status(500).json({ 
        success: false, 
        error: services.error || 'Erreur lors de la récupération des services' 
      });
    }
    
    // Transformer les services avec les prix multipliés et convertis en XAF (avec décimales)
    // IMPORTANT: Les services de type "Package" ou "per 1" ont un prix fixe (pas par 1000)
    const transformedServices = services.map(service => {
      const priceUSD = parseFloat(service.rate);
      const isPackage = service.type === 'Package';
      const isPerOne = isPerOneService(service); // Détecte si prix par 1 ou par 1000
      
      // Pour les packages/per 1: prix fixe, pour les autres: prix par 1000
      const priceXAF = priceUSD * MORETHANPANEL_CONFIG.usdToXafRate * MORETHANPANEL_CONFIG.priceMultiplier;
      const originalPriceXAF = priceUSD * MORETHANPANEL_CONFIG.usdToXafRate;
      
      return {
        id: service.service,
        name: service.name,
        type: service.type,
        category: service.category,
        isPackage: isPackage, // Flag pour identifier les packages (prix fixe)
        isPerOne: isPerOne, // true = prix par unité, false = prix par 1000
        priceXAF: priceXAF, // Prix pour l'utilisateur (avec multiplicateur)
        originalPriceXAF: originalPriceXAF, // Prix fournisseur en XAF
        priceUSD: priceUSD, // Prix fournisseur original
        min: parseInt(service.min),
        max: parseInt(service.max),
        refill: service.refill,
        cancel: service.cancel,
        desc: service.desc || '', // Description/remarques du fournisseur
        dripfeed: service.dripfeed || false,
        provider: 'mtp' // Identifiant fournisseur
      };
    });
    
    console.log(`✅ ${transformedServices.length} services MTP récupérés`);
    res.json({ success: true, services: transformedServices });
    
  } catch (error) {
    console.error('Erreur récupération services MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mtp/balance - Récupérer le solde du compte MoreThanPanel (admin seulement)
app.get('/api/mtp/balance', authenticateMTP, async (req, res) => {
  try {
    const result = await callMoreThanPanelAPI({ action: 'balance' });
    
    if (result.error) {
      return res.status(500).json({ success: false, error: result.error });
    }
    
    const balanceUSD = parseFloat(result.balance);
    const balanceXAF = Math.round(balanceUSD * MORETHANPANEL_CONFIG.usdToXafRate);
    
    res.json({ 
      success: true, 
      balance: balanceUSD,
      balanceXAF: balanceXAF,
      currency: result.currency 
    });
    
  } catch (error) {
    console.error('Erreur récupération solde MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/mtp/order - Passer une commande automatique (SÉCURISÉ)
app.post('/api/mtp/order', authenticateMTP, async (req, res) => {
  try {
    const userId = req.userId; // Depuis le token d'authentification
    const { serviceId, link, quantity, comments } = req.body;
    
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ 
        success: false, 
        error: 'Paramètres manquants: serviceId, link, quantity requis' 
      });
    }
    
    // Valider le lien
    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Le lien doit commencer par http:// ou https://' 
      });
    }
    
    // Calculer le prix côté serveur (sécurisé, pas de confiance au client)
    let priceData;
    try {
      priceData = await calculateMTPPrice(serviceId, quantity);
    } catch (priceError) {
      return res.status(400).json({ success: false, error: priceError.message });
    }
    
    const totalPriceXAF = priceData.totalPriceXAF;
    const serviceInfo = priceData.service;
    
    console.log(`🛒 Commande auto MTP: User=${userId}, Service=${serviceId}, Qty=${quantity}, Prix=${totalPriceXAF} XAF`);
    
    // Transaction atomique: vérifier solde, débiter, et créer la commande
    const userRef = db.collection('users').doc(userId);
    const counterRef = db.collection('counters').doc('autoOrders');
    
    let orderNumber = 1;
    let newBalance = 0;
    let userData = null;
    
    // Phase 1: Transaction Firestore pour réserver le solde
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const counterDoc = await transaction.get(counterRef);
      
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }
      
      userData = userDoc.data();
      const currentBalance = userData.balance || 0;
      
      if (currentBalance < totalPriceXAF) {
        throw new Error(`Solde insuffisant. Requis: ${totalPriceXAF} XAF, Disponible: ${currentBalance} XAF`);
      }
      
      newBalance = currentBalance - totalPriceXAF;
      orderNumber = (counterDoc.exists ? (counterDoc.data().count || 0) : 0) + 1;
      
      transaction.update(userRef, { balance: newBalance });
      transaction.set(counterRef, { count: orderNumber }, { merge: true });
    });
    
    const orderId = `AUTO_SBH_${String(orderNumber).padStart(4, '0')}`;
    
    // Phase 2: Passer la commande chez MoreThanPanel
    let mtpOrderId;
    try {
      const mtpParams = {
        action: 'add',
        service: serviceId.toString(),
        link: link,
        quantity: quantity.toString()
      };
      
      // Ajouter les commentaires personnalisés si fournis
      if (comments && comments.trim()) {
        mtpParams.comments = comments;
        console.log(`📝 Commande avec commentaires personnalisés (${quantity} commentaires)`);
      }
      
      const mtpResult = await callMoreThanPanelAPI(mtpParams);
      
      if (mtpResult.error) {
        // Rembourser l'utilisateur si la commande MTP échoue
        await userRef.update({ 
          balance: admin.firestore.FieldValue.increment(totalPriceXAF) 
        });
        console.error('Erreur MTP order, remboursement effectué:', mtpResult);
        return res.status(500).json({ success: false, error: mtpResult.error });
      }
      
      mtpOrderId = mtpResult.order;
    } catch (mtpError) {
      // Rembourser l'utilisateur si l'appel API échoue
      await userRef.update({ 
        balance: admin.firestore.FieldValue.increment(totalPriceXAF) 
      });
      console.error('Erreur appel MTP API, remboursement effectué:', mtpError);
      return res.status(500).json({ success: false, error: 'Erreur de communication avec le fournisseur' });
    }
    
    console.log(`✅ Commande MTP créée: #${mtpOrderId}`);
    
    // Phase 3: Créer l'enregistrement de commande dans Firestore
    const orderData = {
      orderId: orderId,
      mtpOrderId: mtpOrderId,
      userId: userId,
      userEmail: userData.email || req.userEmail || '',
      userName: userData.displayName || userData.name || '',
      userPhone: userData.phone || '',
      serviceId: parseInt(serviceId),
      serviceName: serviceInfo.name || 'Service automatique',
      serviceCategory: serviceInfo.category || 'Auto',
      link: link,
      quantity: parseInt(quantity),
      priceXAF: totalPriceXAF,
      status: 'En cours',
      mtpStatus: 'Pending',
      orderType: 'automatic',
      hasCustomComments: !!(comments && comments.trim()),
      customComments: comments || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('autoOrders').doc(orderId).set(orderData);
    
    // Ajouter à l'activité utilisateur
    await db.collection('users').doc(userId).collection('activities').add({
      type: 'auto_order',
      description: `Commande automatique #${orderId}`,
      amount: -totalPriceXAF,
      orderId: orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Note: Pas de notification WhatsApp pour les commandes automatiques
    // Tout est géré automatiquement via l'API MoreThanPanel
    
    res.json({ 
      success: true, 
      orderId: orderId,
      mtpOrderId: mtpOrderId,
      newBalance: newBalance,
      message: 'Commande passée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur commande MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mtp/order-status/:orderId - Vérifier le statut d'une commande
app.get('/api/mtp/order-status/:orderId', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('autoOrders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    const mtpOrderId = orderData.mtpOrderId;
    
    // Récupérer le statut depuis MoreThanPanel
    const mtpResult = await callMoreThanPanelAPI({
      action: 'status',
      order: mtpOrderId.toString()
    });
    
    if (mtpResult.error) {
      return res.status(500).json({ success: false, error: mtpResult.error });
    }
    
    // Mapper le statut MTP vers notre statut
    let newStatus = orderData.status;
    if (mtpResult.status === 'Completed') newStatus = 'Terminé';
    else if (mtpResult.status === 'In progress') newStatus = 'En cours';
    else if (mtpResult.status === 'Pending') newStatus = 'En attente';
    else if (mtpResult.status === 'Partial') newStatus = 'Partiel';
    else if (mtpResult.status === 'Canceled') newStatus = 'Annulé';
    else if (mtpResult.status === 'Processing') newStatus = 'Traitement';
    
    // Mettre à jour le statut dans Firestore
    await db.collection('autoOrders').doc(orderId).update({
      status: newStatus,
      mtpStatus: mtpResult.status,
      mtpCharge: mtpResult.charge,
      mtpStartCount: mtpResult.start_count,
      mtpRemains: mtpResult.remains,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId: orderId,
      mtpOrderId: mtpOrderId,
      status: newStatus,
      mtpStatus: mtpResult.status,
      charge: mtpResult.charge,
      startCount: mtpResult.start_count,
      remains: mtpResult.remains
    });
    
  } catch (error) {
    console.error('Erreur statut commande MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/mtp/refill - Demander un refill pour une commande
app.post('/api/mtp/refill', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('autoOrders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    const mtpOrderId = orderData.mtpOrderId;
    
    // Demander le refill chez MoreThanPanel
    const mtpResult = await callMoreThanPanelAPI({
      action: 'refill',
      order: mtpOrderId.toString()
    });
    
    if (mtpResult.error) {
      return res.status(500).json({ success: false, error: mtpResult.error });
    }
    
    const refillId = mtpResult.refill;
    
    // Mettre à jour la commande avec l'ID de refill
    await db.collection('autoOrders').doc(orderId).update({
      refillId: refillId,
      refillRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId: orderId,
      refillId: refillId,
      message: 'Demande de refill envoyée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur refill MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mtp/refill-status/:refillId - Vérifier le statut d'un refill
app.get('/api/mtp/refill-status/:refillId', authenticateMTP, async (req, res) => {
  try {
    const { refillId } = req.params;
    
    const mtpResult = await callMoreThanPanelAPI({
      action: 'refill_status',
      refill: refillId.toString()
    });
    
    if (mtpResult.error) {
      return res.status(500).json({ success: false, error: mtpResult.error });
    }
    
    res.json({
      success: true,
      refillId: refillId,
      status: mtpResult.status
    });
    
  } catch (error) {
    console.error('Erreur statut refill MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/mtp/cancel - Annuler une commande
app.post('/api/mtp/cancel', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('autoOrders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    const mtpOrderId = orderData.mtpOrderId;
    
    // Annuler chez MoreThanPanel
    const mtpResult = await callMoreThanPanelAPI({
      action: 'cancel',
      orders: mtpOrderId.toString()
    });
    
    let cancelled = false;
    if (Array.isArray(mtpResult)) {
      const result = mtpResult.find(r => r.order == mtpOrderId);
      if (result && result.cancel && !result.cancel.error) {
        cancelled = true;
      }
    }
    
    if (!cancelled) {
      return res.status(500).json({ 
        success: false, 
        error: 'Impossible d\'annuler cette commande' 
      });
    }
    
    // Rembourser l'utilisateur avec transaction atomique
    const userRef = db.collection('users').doc(orderData.userId);
    let newBalance = 0;
    
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé pour le remboursement');
      }
      
      const currentBalance = userDoc.data().balance || 0;
      newBalance = currentBalance + orderData.priceXAF;
      
      transaction.update(userRef, { balance: newBalance });
      transaction.update(db.collection('autoOrders').doc(orderId), {
        status: 'Annulé',
        mtpStatus: 'Canceled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        refunded: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    // Ajouter à l'activité utilisateur
    await db.collection('users').doc(orderData.userId).collection('activities').add({
      type: 'refund',
      description: `Remboursement commande #${orderId}`,
      amount: orderData.priceXAF,
      orderId: orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId: orderId,
      refunded: orderData.priceXAF,
      newBalance: newBalance,
      message: 'Commande annulée et remboursée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur annulation MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/mtp/user-orders - Récupérer les commandes auto de l'utilisateur authentifié
app.get('/api/mtp/user-orders', authenticateMTP, async (req, res) => {
  try {
    const userId = req.userId; // Depuis le token d'authentification
    
    const ordersSnapshot = await db.collection('autoOrders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    
    const orders = [];
    ordersSnapshot.forEach(doc => {
      orders.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
        updatedAt: doc.data().updatedAt?.toDate?.() || null
      });
    });
    
    res.json({ success: true, orders: orders });
    
  } catch (error) {
    console.error('Erreur récupération commandes MTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS SMMGEN - Second fournisseur commandes automatiques
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/smmgen/services - Récupérer tous les services SMMGen
app.get('/api/smmgen/services', async (req, res) => {
  try {
    console.log('📦 Récupération des services SMMGen...');
    const services = await callSMMGenAPI({ action: 'services' });
    
    if (!Array.isArray(services)) {
      console.error('Erreur SMMGen services:', services);
      return res.status(500).json({ 
        success: false, 
        error: services.error || 'Erreur lors de la récupération des services' 
      });
    }
    
    // Transformer les services avec les prix multipliés et convertis en XAF
    const transformedServices = services.map(service => {
      const priceUSD = parseFloat(service.rate);
      const isPackage = service.type === 'Package';
      const isPerOne = isPerOneService(service); // Détecte si prix par 1 ou par 1000
      
      // Prix avec multiplicateur 3.5x
      const priceXAF = priceUSD * SMMGEN_CONFIG.usdToXafRate * SMMGEN_CONFIG.priceMultiplier;
      const originalPriceXAF = priceUSD * SMMGEN_CONFIG.usdToXafRate;
      
      return {
        id: service.service,
        name: service.name,
        type: service.type,
        category: service.category,
        isPackage: isPackage,
        isPerOne: isPerOne, // true = prix par unité, false = prix par 1000
        priceXAF: priceXAF,
        originalPriceXAF: originalPriceXAF,
        priceUSD: priceUSD,
        min: parseInt(service.min),
        max: parseInt(service.max),
        refill: service.refill,
        cancel: service.cancel,
        desc: service.desc || '',
        dripfeed: service.dripfeed || false,
        provider: 'smmgen' // Identifiant fournisseur (usage interne)
      };
    });
    
    console.log(`✅ ${transformedServices.length} services SMMGen récupérés`);
    res.json({ success: true, services: transformedServices });
    
  } catch (error) {
    console.error('Erreur récupération services SMMGen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/smmgen/balance - Récupérer le solde du compte SMMGen (admin seulement)
app.get('/api/smmgen/balance', authenticateMTP, async (req, res) => {
  try {
    const result = await callSMMGenAPI({ action: 'balance' });
    
    if (result.error) {
      return res.status(500).json({ success: false, error: result.error });
    }
    
    const balanceUSD = parseFloat(result.balance);
    const balanceXAF = Math.round(balanceUSD * SMMGEN_CONFIG.usdToXafRate);
    
    res.json({ 
      success: true, 
      balance: balanceUSD,
      balanceXAF: balanceXAF,
      currency: result.currency 
    });
    
  } catch (error) {
    console.error('Erreur récupération solde SMMGen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/smmgen/order - Passer une commande automatique SMMGen (SÉCURISÉ)
app.post('/api/smmgen/order', authenticateMTP, async (req, res) => {
  try {
    const userId = req.userId;
    const { serviceId, link, quantity, comments } = req.body;
    
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ 
        success: false, 
        error: 'Paramètres manquants: serviceId, link, quantity requis' 
      });
    }
    
    // Valider le lien
    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Le lien doit commencer par http:// ou https://' 
      });
    }
    
    // Calculer le prix côté serveur (sécurisé)
    let priceData;
    try {
      priceData = await calculateSMMGenPrice(serviceId, quantity);
    } catch (priceError) {
      return res.status(400).json({ success: false, error: priceError.message });
    }
    
    const totalPriceXAF = priceData.totalPriceXAF;
    const serviceInfo = priceData.service;
    
    console.log(`🛒 Commande auto SMMGen: User=${userId}, Service=${serviceId}, Qty=${quantity}, Prix=${totalPriceXAF} XAF`);
    
    // Transaction atomique: vérifier solde, débiter, et créer la commande
    const userRef = db.collection('users').doc(userId);
    const counterRef = db.collection('counters').doc('autoOrders');
    
    let orderNumber = 1;
    let newBalance = 0;
    let userData = null;
    
    // Phase 1: Transaction Firestore pour réserver le solde
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const counterDoc = await transaction.get(counterRef);
      
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }
      
      userData = userDoc.data();
      const currentBalance = userData.balance || 0;
      
      if (currentBalance < totalPriceXAF) {
        throw new Error(`Solde insuffisant. Requis: ${totalPriceXAF} XAF, Disponible: ${currentBalance} XAF`);
      }
      
      newBalance = currentBalance - totalPriceXAF;
      orderNumber = (counterDoc.exists ? (counterDoc.data().count || 0) : 0) + 1;
      
      transaction.update(userRef, { balance: newBalance });
      transaction.set(counterRef, { count: orderNumber }, { merge: true });
    });
    
    const orderId = `AUTO_SBH_${String(orderNumber).padStart(4, '0')}`;
    
    // Phase 2: Passer la commande chez SMMGen
    let smmgenOrderId;
    try {
      const smmgenParams = {
        action: 'add',
        service: serviceId.toString(),
        link: link,
        quantity: quantity.toString()
      };
      
      // Ajouter les commentaires personnalisés si fournis
      if (comments && comments.trim()) {
        smmgenParams.comments = comments;
        console.log(`📝 Commande SMMGen avec commentaires personnalisés (${quantity} commentaires)`);
      }
      
      const smmgenResult = await callSMMGenAPI(smmgenParams);
      
      if (smmgenResult.error) {
        // Rembourser l'utilisateur si la commande échoue
        await userRef.update({ 
          balance: admin.firestore.FieldValue.increment(totalPriceXAF) 
        });
        console.error('Erreur SMMGen order, remboursement effectué:', smmgenResult);
        return res.status(500).json({ success: false, error: smmgenResult.error });
      }
      
      smmgenOrderId = smmgenResult.order;
    } catch (smmgenError) {
      // Rembourser l'utilisateur si l'appel API échoue
      await userRef.update({ 
        balance: admin.firestore.FieldValue.increment(totalPriceXAF) 
      });
      console.error('Erreur appel SMMGen API, remboursement effectué:', smmgenError);
      return res.status(500).json({ success: false, error: 'Erreur de communication avec le fournisseur' });
    }
    
    console.log(`✅ Commande SMMGen créée: #${smmgenOrderId}`);
    
    // Phase 3: Créer l'enregistrement de commande dans Firestore
    const orderData = {
      orderId: orderId,
      providerOrderId: smmgenOrderId, // ID commande chez le fournisseur
      provider: 'smmgen', // Identifiant fournisseur
      userId: userId,
      userEmail: userData.email || req.userEmail || '',
      userName: userData.displayName || userData.name || '',
      userPhone: userData.phone || '',
      serviceId: parseInt(serviceId),
      serviceName: serviceInfo.name || 'Service automatique',
      serviceCategory: serviceInfo.category || 'Auto',
      link: link,
      quantity: parseInt(quantity),
      priceXAF: totalPriceXAF,
      status: 'En cours',
      providerStatus: 'Pending',
      orderType: 'automatic',
      hasCustomComments: !!(comments && comments.trim()),
      customComments: comments || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('autoOrders').doc(orderId).set(orderData);
    
    // Ajouter à l'activité utilisateur
    await db.collection('users').doc(userId).collection('activities').add({
      type: 'auto_order',
      description: `Commande automatique #${orderId}`,
      amount: -totalPriceXAF,
      orderId: orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      orderId: orderId,
      providerOrderId: smmgenOrderId,
      newBalance: newBalance,
      message: 'Commande passée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur commande SMMGen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/smmgen/order-status/:orderId - Vérifier le statut d'une commande SMMGen
app.get('/api/smmgen/order-status/:orderId', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('autoOrders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    // Vérifier que c'est une commande SMMGen
    if (orderData.provider !== 'smmgen') {
      return res.status(400).json({ success: false, error: 'Cette commande n\'est pas une commande SMMGen' });
    }
    
    const providerOrderId = orderData.providerOrderId;
    
    // Récupérer le statut depuis SMMGen
    const smmgenResult = await callSMMGenAPI({
      action: 'status',
      order: providerOrderId.toString()
    });
    
    if (smmgenResult.error) {
      return res.status(500).json({ success: false, error: smmgenResult.error });
    }
    
    // Mapper le statut vers notre statut
    let newStatus = orderData.status;
    if (smmgenResult.status === 'Completed') newStatus = 'Terminé';
    else if (smmgenResult.status === 'In progress') newStatus = 'En cours';
    else if (smmgenResult.status === 'Pending') newStatus = 'En attente';
    else if (smmgenResult.status === 'Partial') newStatus = 'Partiel';
    else if (smmgenResult.status === 'Canceled') newStatus = 'Annulé';
    else if (smmgenResult.status === 'Processing') newStatus = 'Traitement';
    
    // Mettre à jour le statut dans Firestore
    await db.collection('autoOrders').doc(orderId).update({
      status: newStatus,
      providerStatus: smmgenResult.status,
      providerCharge: smmgenResult.charge,
      providerStartCount: smmgenResult.start_count,
      providerRemains: smmgenResult.remains,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId: orderId,
      providerOrderId: providerOrderId,
      status: newStatus,
      providerStatus: smmgenResult.status,
      charge: smmgenResult.charge,
      startCount: smmgenResult.start_count,
      remains: smmgenResult.remains
    });
    
  } catch (error) {
    console.error('Erreur statut commande SMMGen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/smmgen/refill - Demander un refill pour une commande SMMGen
app.post('/api/smmgen/refill', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('autoOrders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    // Vérifier que c'est une commande SMMGen
    if (orderData.provider !== 'smmgen') {
      return res.status(400).json({ success: false, error: 'Cette commande n\'est pas une commande SMMGen' });
    }
    
    const providerOrderId = orderData.providerOrderId;
    
    // Demander le refill chez SMMGen
    const smmgenResult = await callSMMGenAPI({
      action: 'refill',
      order: providerOrderId.toString()
    });
    
    if (smmgenResult.error) {
      return res.status(500).json({ success: false, error: smmgenResult.error });
    }
    
    const refillId = smmgenResult.refill;
    
    // Mettre à jour la commande avec l'ID de refill
    await db.collection('autoOrders').doc(orderId).update({
      refillId: refillId,
      refillRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId: orderId,
      refillId: refillId,
      message: 'Demande de refill envoyée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur refill SMMGen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/smmgen/cancel - Annuler une commande SMMGen
app.post('/api/smmgen/cancel', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('autoOrders').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    // Vérifier que c'est une commande SMMGen
    if (orderData.provider !== 'smmgen') {
      return res.status(400).json({ success: false, error: 'Cette commande n\'est pas une commande SMMGen' });
    }
    
    const providerOrderId = orderData.providerOrderId;
    
    // Annuler chez SMMGen
    const smmgenResult = await callSMMGenAPI({
      action: 'cancel',
      orders: providerOrderId.toString()
    });
    
    let cancelled = false;
    if (Array.isArray(smmgenResult)) {
      const result = smmgenResult.find(r => r.order == providerOrderId);
      if (result && result.cancel && !result.cancel.error) {
        cancelled = true;
      }
    }
    
    if (!cancelled) {
      return res.status(500).json({ 
        success: false, 
        error: 'Impossible d\'annuler cette commande' 
      });
    }
    
    // Rembourser l'utilisateur avec transaction atomique
    const userRef = db.collection('users').doc(orderData.userId);
    let newBalance = 0;
    
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('Utilisateur non trouvé');
      }
      
      const currentBalance = userDoc.data().balance || 0;
      newBalance = currentBalance + orderData.priceXAF;
      
      transaction.update(userRef, { balance: newBalance });
    });
    
    // Mettre à jour le statut de la commande
    await db.collection('autoOrders').doc(orderId).update({
      status: 'Annulé',
      providerStatus: 'Canceled',
      refunded: true,
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Ajouter à l'activité utilisateur
    await db.collection('users').doc(orderData.userId).collection('activities').add({
      type: 'refund',
      description: `Remboursement commande annulée #${orderId}`,
      amount: orderData.priceXAF,
      orderId: orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId: orderId,
      newBalance: newBalance,
      refundedAmount: orderData.priceXAF,
      message: 'Commande annulée et remboursée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur annulation SMMGen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FONCTION CENTRALISÉE DE REMBOURSEMENT AUTOMATIQUE
// Gère les remboursements pour commandes annulées ou partiellement livrées
// ═══════════════════════════════════════════════════════════════════════════
async function processAutoRefund(orderDoc, statusData, provider, collection) {
  const orderId = orderDoc.id || orderDoc.docId;
  const orderData = orderDoc.data ? orderDoc.data() : orderDoc.docData;

  if (!orderData || !orderData.userId) {
    console.error(`❌ Remboursement impossible: données commande manquantes pour ${orderId}`);
    return { success: false, reason: 'Données commande manquantes' };
  }

  if (orderData.refunded) {
    console.log(`⚠️ Commande ${orderId} déjà remboursée, on ignore`);
    return { success: false, reason: 'Déjà remboursé' };
  }

  const providerStatus = statusData.status;
  const isFullCancel = providerStatus === 'Canceled';
  const isPartial = providerStatus === 'Partial';

  if (!isFullCancel && !isPartial) {
    return { success: false, reason: 'Statut ne nécessite pas de remboursement' };
  }

  let pricePaidXAF = 0;
  if (collection === 'commandes') {
    pricePaidXAF = orderData.finalCost || orderData.totalCost || 0;
  } else {
    pricePaidXAF = orderData.priceXAF || 0;
  }

  if (pricePaidXAF <= 0) {
    console.error(`❌ Remboursement impossible: prix payé = 0 pour commande ${orderId}`);
    return { success: false, reason: 'Prix payé introuvable' };
  }

  let refundAmountXAF = 0;

  if (isFullCancel) {
    refundAmountXAF = pricePaidXAF;
  } else if (isPartial) {
    const charge = statusData.charge ? parseFloat(statusData.charge) : null;
    const remains = statusData.remains ? parseFloat(statusData.remains) : null;
    const quantity = orderData.quantity ? parseFloat(orderData.quantity) : 0;

    if (charge !== null && quantity > 0) {
      let providerRefundUSD = 0;
      if (provider === 'afriqueboost') {
        const providerChargeXAF = parseFloat(charge);
        const providerPricePerUnit = orderData.providerPriceXAF || (pricePaidXAF / AFRIQUEBOOST_CONFIG.priceMultiplier / quantity);
        const deliveredQty = quantity - (remains || 0);
        const deliveredCostXAF = (pricePaidXAF / quantity) * deliveredQty;
        refundAmountXAF = Math.round(pricePaidXAF - deliveredCostXAF);
      } else {
        const config = provider === 'mtp' ? MORETHANPANEL_CONFIG :
                       provider === 'smmgen' ? SMMGEN_CONFIG :
                       EXOSUPPLIER_CONFIG;
        providerRefundUSD = parseFloat(charge);
        const providerRefundXAF = providerRefundUSD * config.usdToXafRate * config.priceMultiplier;
        refundAmountXAF = Math.round(providerRefundXAF);
      }
    } else if (remains !== null && quantity > 0) {
      const deliveredQty = quantity - remains;
      const deliveredCostXAF = (pricePaidXAF / quantity) * deliveredQty;
      refundAmountXAF = Math.round(pricePaidXAF - deliveredCostXAF);
    } else {
      refundAmountXAF = 0;
      console.warn(`⚠️ Commande partielle ${orderId}: impossible de calculer le remboursement (charge=${charge}, remains=${remains}, qty=${quantity})`);
      return { success: false, reason: 'Données insuffisantes pour calcul partiel' };
    }
  }

  if (refundAmountXAF <= 0) {
    console.log(`ℹ️ Commande ${orderId}: montant remboursement = 0, tout a été livré`);
    await db.collection(collection).doc(orderId).update({
      refunded: true,
      refundAmount: 0,
      refundReason: 'Tout livré - aucun remboursement nécessaire',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true, amount: 0, reason: 'Tout livré' };
  }

  if (refundAmountXAF > pricePaidXAF) {
    console.warn(`⚠️ Remboursement plafonné: ${refundAmountXAF} > ${pricePaidXAF} pour commande ${orderId}`);
    refundAmountXAF = pricePaidXAF;
  }

  try {
    const userRef = db.collection('users').doc(orderData.userId);

    let newBalance = 0;
    let oldBalance = 0;
    let userName = '';
    let userEmail = '';
    let userPhone = '';

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Utilisateur non trouvé');

      const userData = userDoc.data();
      oldBalance = userData.balance || 0;
      newBalance = oldBalance + refundAmountXAF;
      userName = userData.username || userData.displayName || 'N/A';
      userEmail = userData.email || 'N/A';
      userPhone = userData.phone || 'Non renseigné';

      transaction.update(userRef, { balance: newBalance });

      const statusLabel = isFullCancel ? 'Annulé' : 'Partiel';
      const providerStatusLabel = isFullCancel ? 'Canceled' : 'Partial';

      const updateFields = {
        status: collection === 'commandes' ? (isFullCancel ? 'annulée' : 'partiel') : statusLabel,
        refunded: true,
        refundAmount: refundAmountXAF,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        refundReason: isFullCancel ? 'Commande annulée par le fournisseur' : 'Commande partiellement livrée - reste remboursé',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (collection === 'commandes') {
        updateFields.exoStatus = providerStatusLabel;
      } else if (collection === 'autoOrders') {
        updateFields.providerStatus = providerStatusLabel;
        if (provider === 'mtp') updateFields.mtpStatus = providerStatusLabel;
      } else if (collection === 'advancedOrders') {
        updateFields.providerStatus = providerStatusLabel;
      }

      transaction.update(db.collection(collection).doc(orderId), updateFields);
    });

    console.log(`💰 Remboursement ${isFullCancel ? 'total' : 'partiel'}: ${refundAmountXAF} XAF pour commande ${orderId} (${provider})`);

    if (clientTwilio && ADMIN_WHATSAPP_NUMBER) {
      try {
        const dateStr = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Douala' });
        const providerNames = { mtp: 'MoreThanPanel', smmgen: 'SMMGen', exo: 'ExoSupplier', afriqueboost: 'AfriqueBoost' };
        const providerLabel = providerNames[provider] || provider;

        const quantityOrdered = orderData.quantity || 'N/A';
        const delivered = statusData.remains ? (parseFloat(quantityOrdered) - parseFloat(statusData.remains)) : 'N/A';
        const remaining = statusData.remains || 'N/A';

        const messageBody = isFullCancel
          ? `🔴 *COMMANDE ANNULÉE ET REMBOURSÉE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📅 ${dateStr}\n\n` +
            `📋 *COMMANDE*\n` +
            `├─ ID: *${orderId}*\n` +
            `├─ Fournisseur: *${providerLabel}*\n` +
            `├─ Service: ${orderData.serviceName || orderData.service || 'N/A'}\n` +
            `├─ Quantité: ${quantityOrdered}\n` +
            `├─ Montant payé: *${pricePaidXAF.toLocaleString('fr-FR')} XAF*\n` +
            `└─ Lien: ${orderData.link || 'N/A'}\n\n` +
            `👤 *UTILISATEUR*\n` +
            `├─ Nom: *${userName}*\n` +
            `├─ Email: ${userEmail}\n` +
            `├─ Tél: ${userPhone}\n\n` +
            `💰 *REMBOURSEMENT*\n` +
            `├─ Montant remboursé: *${refundAmountXAF.toLocaleString('fr-FR')} XAF*\n` +
            `├─ Ancien solde: ${oldBalance.toLocaleString('fr-FR')} XAF\n` +
            `├─ Nouveau solde: *${newBalance.toLocaleString('fr-FR')} XAF*\n` +
            `└─ Raison: Commande annulée par le fournisseur\n\n` +
            `✅ *Remboursement effectué automatiquement*`
          : `🟡 *COMMANDE PARTIELLE - REMBOURSEMENT PARTIEL*\n` +
            `━━━━━━━━━━━━━━━━━━━━━\n` +
            `📅 ${dateStr}\n\n` +
            `📋 *COMMANDE*\n` +
            `├─ ID: *${orderId}*\n` +
            `├─ Fournisseur: *${providerLabel}*\n` +
            `├─ Service: ${orderData.serviceName || orderData.service || 'N/A'}\n` +
            `├─ Quantité commandée: ${quantityOrdered}\n` +
            `├─ Quantité livrée: ${delivered}\n` +
            `├─ Quantité restante: ${remaining}\n` +
            `├─ Montant total payé: *${pricePaidXAF.toLocaleString('fr-FR')} XAF*\n` +
            `└─ Lien: ${orderData.link || 'N/A'}\n\n` +
            `👤 *UTILISATEUR*\n` +
            `├─ Nom: *${userName}*\n` +
            `├─ Email: ${userEmail}\n` +
            `├─ Tél: ${userPhone}\n\n` +
            `💰 *REMBOURSEMENT PARTIEL*\n` +
            `├─ Montant remboursé: *${refundAmountXAF.toLocaleString('fr-FR')} XAF*\n` +
            `├─ Ancien solde: ${oldBalance.toLocaleString('fr-FR')} XAF\n` +
            `├─ Nouveau solde: *${newBalance.toLocaleString('fr-FR')} XAF*\n` +
            `└─ Raison: Livraison partielle - reste non livré remboursé\n\n` +
            `✅ *Remboursement partiel effectué automatiquement*`;

        await clientTwilio.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
          body: messageBody
        });
        console.log(`📱 Notification WhatsApp envoyée: Remboursement ${isFullCancel ? 'total' : 'partiel'} commande ${orderId}`);
      } catch (twilioErr) {
        console.warn(`⚠️ Notification WhatsApp échouée (remboursement ${orderId}):`, twilioErr.message);
      }
    }

    return { success: true, amount: refundAmountXAF, type: isFullCancel ? 'total' : 'partiel' };

  } catch (refundError) {
    console.error(`❌ Erreur remboursement commande ${orderId}:`, refundError.message);

    if (clientTwilio && ADMIN_WHATSAPP_NUMBER) {
      try {
        await clientTwilio.messages.create({
          from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${ADMIN_WHATSAPP_NUMBER}`,
          body: `❌ *ÉCHEC REMBOURSEMENT*\n\n` +
                `📋 Commande: ${orderId}\n` +
                `👤 Utilisateur: ${orderData.userId}\n` +
                `💰 Montant: ${refundAmountXAF.toLocaleString('fr-FR')} XAF\n` +
                `❌ Erreur: ${refundError.message}\n\n` +
                `⚠️ *Action manuelle requise*`
        });
      } catch (e) { /* ignore */ }
    }

    return { success: false, reason: refundError.message };
  }
}

// Tâche CRON pour vérifier les statuts des commandes auto en cours (MTP + SMMGen)
cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 Vérification statuts commandes automatiques (MTP + SMMGen)...');
  try {
    const pendingOrders = await db.collection('autoOrders')
      .where('status', 'in', ['En cours', 'En attente', 'Traitement'])
      .limit(50)
      .get();
    
    if (pendingOrders.empty) {
      console.log('✅ Aucune commande auto en attente');
      return;
    }
    
    // Séparer les commandes par fournisseur
    const mtpOrders = [];
    const smmgenOrders = [];
    const mtpOrderMap = {};
    const smmgenOrderMap = {};
    
    pendingOrders.forEach(doc => {
      const data = doc.data();
      const provider = data.provider || 'mtp'; // Par défaut MTP pour les anciennes commandes
      
      if (provider === 'smmgen') {
        smmgenOrders.push(data.providerOrderId?.toString());
        smmgenOrderMap[data.providerOrderId] = doc.id;
      } else {
        // MTP ou anciennes commandes sans provider
        const orderId = data.mtpOrderId || data.providerOrderId;
        if (orderId) {
          mtpOrders.push(orderId.toString());
          mtpOrderMap[orderId] = doc.id;
        }
      }
    });
    
    // Vérifier les commandes MTP
    if (mtpOrders.length > 0) {
      try {
        const mtpResult = await callMoreThanPanelAPI({
          action: 'status',
          orders: mtpOrders.join(',')
        });
        
        for (const [provId, statusData] of Object.entries(mtpResult)) {
          const orderId = mtpOrderMap[provId];
          if (!orderId || statusData.error) continue;
          
          let newStatus = 'En cours';
          if (statusData.status === 'Completed') newStatus = 'Terminé';
          else if (statusData.status === 'In progress') newStatus = 'En cours';
          else if (statusData.status === 'Pending') newStatus = 'En attente';
          else if (statusData.status === 'Partial') newStatus = 'Partiel';
          else if (statusData.status === 'Canceled') newStatus = 'Annulé';
          else if (statusData.status === 'Processing') newStatus = 'Traitement';
          
          if (statusData.status === 'Canceled' || statusData.status === 'Partial') {
            const orderDocSnap = await db.collection('autoOrders').doc(orderId).get();
            if (orderDocSnap.exists) {
              await processAutoRefund(orderDocSnap, statusData, 'mtp', 'autoOrders');
            }
          } else {
            await db.collection('autoOrders').doc(orderId).update({
              status: newStatus,
              mtpStatus: statusData.status,
              providerStatus: statusData.status,
              mtpCharge: statusData.charge,
              mtpRemains: statusData.remains,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
        console.log(`✅ ${mtpOrders.length} commandes MTP vérifiées`);
      } catch (mtpError) {
        console.error('Erreur vérification MTP:', mtpError);
      }
    }
    
    // Vérifier les commandes SMMGen
    if (smmgenOrders.length > 0) {
      try {
        const smmgenResult = await callSMMGenAPI({
          action: 'status',
          orders: smmgenOrders.join(',')
        });
        
        for (const [provId, statusData] of Object.entries(smmgenResult)) {
          const orderId = smmgenOrderMap[provId];
          if (!orderId || statusData.error) continue;
          
          let newStatus = 'En cours';
          if (statusData.status === 'Completed') newStatus = 'Terminé';
          else if (statusData.status === 'In progress') newStatus = 'En cours';
          else if (statusData.status === 'Pending') newStatus = 'En attente';
          else if (statusData.status === 'Partial') newStatus = 'Partiel';
          else if (statusData.status === 'Canceled') newStatus = 'Annulé';
          else if (statusData.status === 'Processing') newStatus = 'Traitement';
          
          if (statusData.status === 'Canceled' || statusData.status === 'Partial') {
            const orderDocSnap = await db.collection('autoOrders').doc(orderId).get();
            if (orderDocSnap.exists) {
              await processAutoRefund(orderDocSnap, statusData, 'smmgen', 'autoOrders');
            }
          } else {
            await db.collection('autoOrders').doc(orderId).update({
              status: newStatus,
              providerStatus: statusData.status,
              providerCharge: statusData.charge,
              providerRemains: statusData.remains,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
        console.log(`✅ ${smmgenOrders.length} commandes SMMGen vérifiées`);
      } catch (smmgenError) {
        console.error('Erreur vérification SMMGen:', smmgenError);
      }
    }
    
    console.log(`✅ Total: ${pendingOrders.size} commandes auto vérifiées`);
  } catch (error) {
    console.error('Erreur vérification statuts auto:', error);
  }
});
console.log('⏰ Tâche automatique configurée: Vérification commandes auto (MTP + SMMGen) toutes les 10 minutes');

// ═══════════════════════════════════════════════════════════════════════════
// CRON: Vérification des statuts des commandes ExoSupplier (standard auto)
// ═══════════════════════════════════════════════════════════════════════════
cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 Vérification statuts commandes ExoSupplier...');
  try {
    // Récupérer les commandes standards avec un exoOrderId
    const pendingOrders = await getDB().collection('commandes')
      .where('isAutoOrder', '==', true)
      .where('status', 'in', ['En attente', 'en cours'])
      .limit(50)
      .get();
    
    if (pendingOrders.empty) {
      console.log('✅ Aucune commande ExoSupplier en attente');
      return;
    }
    
    const exoOrderIds = [];
    const orderMap = {};
    
    pendingOrders.forEach(doc => {
      const data = doc.data();
      if (data.exoOrderId) {
        exoOrderIds.push(data.exoOrderId.toString());
        orderMap[data.exoOrderId] = { docId: doc.id, docData: data };
      }
    });
    
    if (exoOrderIds.length === 0) {
      console.log('✅ Aucune commande ExoSupplier à vérifier');
      return;
    }
    
    // Vérifier plusieurs commandes à la fois
    const exoResult = await callExoSupplierAPI({
      action: 'status',
      orders: exoOrderIds.join(',')
    });
    
    let updatedCount = 0;
    
    for (const [exoId, statusData] of Object.entries(exoResult)) {
      const orderInfo = orderMap[exoId];
      if (!orderInfo || statusData.error) continue;
      
      let exoStatusDisplay = 'In progress';
      let finalStatus = 'en cours';
      
      if (statusData.status === 'Completed') {
        exoStatusDisplay = 'Completed';
        finalStatus = 'succès';
      } else if (statusData.status === 'In progress') {
        exoStatusDisplay = 'In progress';
        finalStatus = 'en cours';
      } else if (statusData.status === 'Pending') {
        exoStatusDisplay = 'Pending';
        finalStatus = 'En attente';
      } else if (statusData.status === 'Partial') {
        exoStatusDisplay = 'Partial';
        finalStatus = 'partiel';
      } else if (statusData.status === 'Canceled') {
        exoStatusDisplay = 'Canceled';
        finalStatus = 'annulée';
      } else if (statusData.status === 'Processing') {
        exoStatusDisplay = 'Processing';
        finalStatus = 'en cours';
      }
      
      const updateData = {
        status: finalStatus,
        exoStatus: exoStatusDisplay,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Ajouter les infos de progression si disponibles
      if (statusData.charge !== undefined) updateData.exoCharge = statusData.charge;
      if (statusData.remains !== undefined) updateData.exoRemains = statusData.remains;
      if (statusData.start_count !== undefined) updateData.startCount = statusData.start_count;
      
      await getDB().collection('commandes').doc(orderInfo.docId).update(updateData);
      updatedCount++;
      
      if (statusData.status === 'Canceled' || statusData.status === 'Partial') {
        const orderDocSnap = await getDB().collection('commandes').doc(orderInfo.docId).get();
        if (orderDocSnap.exists) {
          await processAutoRefund(orderDocSnap, statusData, 'exo', 'commandes');
        }
      }
    }
    
    console.log(`✅ ${updatedCount}/${pendingOrders.size} commandes ExoSupplier mises à jour`);
  } catch (error) {
    console.error('❌ Erreur vérification statuts ExoSupplier:', error);
  }
});
console.log('⏰ Tâche automatique configurée: Vérification commandes ExoSupplier toutes les 10 minutes');

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINTS API - Gestion des commandes ExoSupplier (status, refill, cancel)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/exo/order-status/:orderId - Vérifier le statut d'une commande ExoSupplier
app.get('/api/exo/order-status/:orderId', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('commandes').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    const exoOrderId = orderData.exoOrderId;
    
    if (!exoOrderId) {
      return res.status(400).json({ success: false, error: 'Cette commande n\'est pas une commande automatique ExoSupplier' });
    }
    
    // Récupérer le statut depuis ExoSupplier
    const exoResult = await callExoSupplierAPI({
      action: 'status',
      order: exoOrderId.toString()
    });
    
    if (exoResult.error) {
      return res.status(500).json({ success: false, error: exoResult.error });
    }
    
    // Mapper le statut
    let exoStatusDisplay = 'In progress';
    let finalStatus = 'en cours';
    
    if (exoResult.status === 'Completed') {
      exoStatusDisplay = 'Completed';
      finalStatus = 'succès';
    } else if (exoResult.status === 'In progress') {
      exoStatusDisplay = 'In progress';
      finalStatus = 'en cours';
    } else if (exoResult.status === 'Pending') {
      exoStatusDisplay = 'Pending';
      finalStatus = 'En attente';
    } else if (exoResult.status === 'Partial') {
      exoStatusDisplay = 'Partial';
      finalStatus = 'partiel';
    } else if (exoResult.status === 'Canceled') {
      exoStatusDisplay = 'Canceled';
      finalStatus = 'annulée';
    } else if (exoResult.status === 'Processing') {
      exoStatusDisplay = 'Processing';
      finalStatus = 'en cours';
    }
    
    // Mettre à jour la commande dans Firestore
    const updateData = {
      status: finalStatus,
      exoStatus: exoStatusDisplay,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (exoResult.charge !== undefined) updateData.exoCharge = exoResult.charge;
    if (exoResult.remains !== undefined) updateData.exoRemains = exoResult.remains;
    if (exoResult.start_count !== undefined) updateData.startCount = exoResult.start_count;
    
    await db.collection('commandes').doc(orderId).update(updateData);
    
    res.json({
      success: true,
      orderId,
      exoOrderId,
      status: finalStatus,
      exoStatus: exoStatusDisplay,
      charge: exoResult.charge,
      startCount: exoResult.start_count,
      remains: exoResult.remains,
      currency: exoResult.currency
    });
    
  } catch (error) {
    console.error('Erreur statut ExoSupplier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/exo/refill - Demander un refill pour une commande ExoSupplier
app.post('/api/exo/refill', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('commandes').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    const exoOrderId = orderData.exoOrderId;
    
    if (!exoOrderId) {
      return res.status(400).json({ success: false, error: 'Cette commande n\'est pas une commande automatique ExoSupplier' });
    }
    
    // Demander le refill chez ExoSupplier
    const exoResult = await callExoSupplierAPI({
      action: 'refill',
      order: exoOrderId.toString()
    });
    
    if (exoResult.error) {
      return res.status(500).json({ success: false, error: exoResult.error });
    }
    
    // Mettre à jour la commande
    await db.collection('commandes').doc(orderId).update({
      refillRequested: true,
      refillRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
      refillId: exoResult.refill || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      orderId,
      refillId: exoResult.refill,
      message: 'Demande de refill envoyée avec succès'
    });
    
  } catch (error) {
    console.error('Erreur refill ExoSupplier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/exo/cancel - Annuler une commande ExoSupplier
app.post('/api/exo/cancel', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'orderId requis' });
    }
    
    // Récupérer la commande depuis Firestore
    const orderDoc = await db.collection('commandes').doc(orderId).get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }
    
    const orderData = orderDoc.data();
    
    // Vérifier que la commande appartient à l'utilisateur
    if (orderData.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé à cette commande' });
    }
    
    const exoOrderId = orderData.exoOrderId;
    
    if (!exoOrderId) {
      return res.status(400).json({ success: false, error: 'Cette commande n\'est pas une commande automatique ExoSupplier' });
    }
    
    // Vérifier que la commande peut être annulée
    if (['succès', 'annulée', 'Completed', 'Canceled'].includes(orderData.status)) {
      return res.status(400).json({ success: false, error: 'Cette commande ne peut pas être annulée (déjà terminée ou annulée)' });
    }
    
    // Annuler chez ExoSupplier
    const exoResult = await callExoSupplierAPI({
      action: 'cancel',
      orders: exoOrderId.toString()
    });
    
    if (exoResult.error) {
      return res.status(500).json({ success: false, error: exoResult.error });
    }
    
    // Vérifier le résultat de l'annulation
    const cancelResult = exoResult[exoOrderId] || exoResult;
    
    if (cancelResult.cancel) {
      // Annulation réussie - rembourser l'utilisateur
      const refundAmount = orderData.finalCost || orderData.totalCost || 0;
      
      if (refundAmount > 0) {
        await db.collection('users').doc(userId).update({
          balance: admin.firestore.FieldValue.increment(refundAmount)
        });
      }
      
      await db.collection('commandes').doc(orderId).update({
        status: 'annulée',
        exoStatus: 'Canceled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        refundAmount: refundAmount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({
        success: true,
        orderId,
        message: 'Commande annulée avec succès',
        refundAmount
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        error: 'Impossible d\'annuler cette commande. Elle est peut-être déjà en cours de traitement.' 
      });
    }
    
  } catch (error) {
    console.error('Erreur annulation ExoSupplier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AFRIQUEBOOST API INTEGRATION - Commandes Avancées
// ═══════════════════════════════════════════════════════════════════════════
const AFRIQUEBOOST_CONFIG = {
  apiUrl: 'https://afriqueboost.com/api/v2',
  apiKey: process.env.ADVANCED_PROVIDER_API_KEY,
  priceMultiplier: 1.82
};

let afriqueboostServicesCache = {
  services: [],
  lastFetch: null,
  cacheTTL: 5 * 60 * 1000
};

async function callAfriqueBoostAPI(params) {
  const fetch = (await import('node-fetch')).default;
  const formData = new URLSearchParams();
  formData.append('key', AFRIQUEBOOST_CONFIG.apiKey);
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value);
  }
  try {
    const response = await fetch(AFRIQUEBOOST_CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('AfriqueBoost API non-JSON response:', text);
      throw new Error('Invalid API response');
    }
  } catch (error) {
    console.error('AfriqueBoost API call failed:', error);
    throw error;
  }
}

async function getAfriqueBoostServices() {
  const now = Date.now();
  if (afriqueboostServicesCache.services.length > 0 &&
      afriqueboostServicesCache.lastFetch &&
      (now - afriqueboostServicesCache.lastFetch) < afriqueboostServicesCache.cacheTTL) {
    return afriqueboostServicesCache.services;
  }
  const services = await callAfriqueBoostAPI({ action: 'services' });
  if (Array.isArray(services)) {
    afriqueboostServicesCache.services = services;
    afriqueboostServicesCache.lastFetch = now;
    console.log(`✅ ${services.length} services AfriqueBoost chargés en cache`);
  }
  return afriqueboostServicesCache.services;
}

async function calculateAfriqueBoostPrice(serviceId, quantity) {
  const services = await getAfriqueBoostServices();
  const service = services.find(s => s.service == serviceId);
  if (!service) throw new Error(`Service ${serviceId} non trouvé`);
  const min = parseInt(service.min);
  const max = parseInt(service.max);
  const qty = parseInt(quantity);
  if (qty < min || qty > max) throw new Error(`Quantité invalide. Min: ${min}, Max: ${max}`);
  const rateXAF = parseFloat(service.rate);
  const isPerOne = isPerOneService(service);
  const priceXAF = rateXAF * AFRIQUEBOOST_CONFIG.priceMultiplier;
  const totalPriceXAF = isPerOne ? priceXAF * qty : (priceXAF / 1000) * qty;
  return { service, isPerOne, priceXAF, totalPriceXAF, quantity: qty };
}

// GET /api/afriqueboost/services
app.get('/api/afriqueboost/services', async (req, res) => {
  try {
    console.log('📦 Récupération des services AfriqueBoost...');
    const services = await callAfriqueBoostAPI({ action: 'services' });
    if (!Array.isArray(services)) {
      return res.status(500).json({ success: false, error: services.error || 'Erreur récupération services' });
    }
    const transformedServices = services.map(service => {
      const rateXAF = parseFloat(service.rate);
      const isPerOne = isPerOneService(service);
      const priceXAF = rateXAF * AFRIQUEBOOST_CONFIG.priceMultiplier;
      const originalPriceXAF = rateXAF;
      return {
        id: service.service,
        name: service.name,
        type: service.type,
        category: service.category,
        isPackage: service.type === 'Package',
        isPerOne: isPerOne,
        priceXAF: priceXAF,
        originalPriceXAF: originalPriceXAF,
        rateXAF: rateXAF,
        min: parseInt(service.min),
        max: parseInt(service.max),
        refill: service.refill,
        cancel: service.cancel,
        desc: service.desc || '',
        dripfeed: service.dripfeed || false,
        provider: 'afriqueboost'
      };
    });
    console.log(`✅ ${transformedServices.length} services AfriqueBoost récupérés`);
    res.json({ success: true, services: transformedServices });
  } catch (error) {
    console.error('Erreur récupération services AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/afriqueboost/balance
app.get('/api/afriqueboost/balance', authenticateMTP, async (req, res) => {
  try {
    const result = await callAfriqueBoostAPI({ action: 'balance' });
    if (result.error) return res.status(500).json({ success: false, error: result.error });
    const balanceXAF = parseFloat(result.balance);
    res.json({ success: true, balance: balanceXAF, balanceXAF, currency: result.currency || 'XAF' });
  } catch (error) {
    console.error('Erreur récupération solde AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/afriqueboost/order
app.post('/api/afriqueboost/order', authenticateMTP, async (req, res) => {
  try {
    const userId = req.userId;
    const { serviceId, link, quantity, comments } = req.body;
    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ success: false, error: 'Paramètres manquants: serviceId, link, quantity requis' });
    }
    if (!link.startsWith('http://') && !link.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'Le lien doit commencer par http:// ou https://' });
    }
    let priceData;
    try {
      priceData = await calculateAfriqueBoostPrice(serviceId, quantity);
    } catch (priceError) {
      return res.status(400).json({ success: false, error: priceError.message });
    }
    const totalPriceXAF = priceData.totalPriceXAF;
    const serviceInfo = priceData.service;
    console.log(`🛒 Commande avancée AfriqueBoost: User=${userId}, Service=${serviceId}, Qty=${quantity}, Prix=${totalPriceXAF} XAF`);
    const userRef = db.collection('users').doc(userId);
    const counterRef = db.collection('counters').doc('advancedOrders');
    let orderNumber = 1;
    let newBalance = 0;
    let userData = null;
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const counterDoc = await transaction.get(counterRef);
      if (!userDoc.exists) throw new Error('Utilisateur non trouvé');
      userData = userDoc.data();
      const currentBalance = userData.balance || 0;
      if (currentBalance < totalPriceXAF) {
        throw new Error(`Solde insuffisant. Requis: ${totalPriceXAF} XAF, Disponible: ${currentBalance} XAF`);
      }
      newBalance = currentBalance - totalPriceXAF;
      orderNumber = (counterDoc.exists ? (counterDoc.data().count || 0) : 0) + 1;
      transaction.update(userRef, { balance: newBalance });
      transaction.set(counterRef, { count: orderNumber }, { merge: true });
    });
    const orderId = `SBH-AUTO2-${String(orderNumber).padStart(4, '0')}`;
    let providerOrderId;
    try {
      const abParams = {
        action: 'add',
        service: serviceId.toString(),
        link: link,
        quantity: quantity.toString()
      };
      if (comments && comments.trim()) {
        abParams.comments = comments;
      }
      const abResult = await callAfriqueBoostAPI(abParams);
      if (abResult.error) {
        await userRef.update({ balance: admin.firestore.FieldValue.increment(totalPriceXAF) });
        console.error('Erreur AfriqueBoost order, remboursement effectué:', abResult);
        return res.status(500).json({ success: false, error: abResult.error });
      }
      providerOrderId = abResult.order;
    } catch (abError) {
      await userRef.update({ balance: admin.firestore.FieldValue.increment(totalPriceXAF) });
      console.error('Erreur appel AfriqueBoost API, remboursement effectué:', abError);
      return res.status(500).json({ success: false, error: 'Erreur de communication avec le fournisseur' });
    }
    console.log(`✅ Commande AfriqueBoost créée: #${providerOrderId}`);
    const orderData = {
      orderId: orderId,
      providerOrderId: providerOrderId,
      provider: 'afriqueboost',
      userId: userId,
      userEmail: userData.email || req.userEmail || '',
      userName: userData.displayName || userData.name || '',
      userPhone: userData.phone || '',
      serviceId: parseInt(serviceId),
      serviceName: serviceInfo.name || 'Service avancé',
      serviceCategory: serviceInfo.category || 'Avancé',
      link: link,
      quantity: parseInt(quantity),
      priceXAF: totalPriceXAF,
      status: 'En cours',
      providerStatus: 'Pending',
      orderType: 'automatic',
      hasCustomComments: !!(comments && comments.trim()),
      customComments: comments || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('advancedOrders').doc(orderId).set(orderData);
    await db.collection('users').doc(userId).collection('activities').add({
      type: 'advanced_order',
      description: `Commande avancée #${orderId}`,
      amount: -totalPriceXAF,
      orderId: orderId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({
      success: true,
      orderId: orderId,
      providerOrderId: providerOrderId,
      newBalance: newBalance,
      message: 'Commande passée avec succès'
    });
  } catch (error) {
    console.error('Erreur commande AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/afriqueboost/order-status/:orderId
app.get('/api/afriqueboost/order-status/:orderId', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    const orderDoc = await db.collection('advancedOrders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    const orderData = orderDoc.data();
    if (orderData.userId !== userId) return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    if (orderData.provider !== 'afriqueboost') return res.status(400).json({ success: false, error: 'Commande non AfriqueBoost' });
    const abResult = await callAfriqueBoostAPI({ action: 'status', order: orderData.providerOrderId.toString() });
    if (abResult.error) return res.status(500).json({ success: false, error: abResult.error });
    let newStatus = orderData.status;
    if (abResult.status === 'Completed') newStatus = 'Terminé';
    else if (abResult.status === 'In progress') newStatus = 'En cours';
    else if (abResult.status === 'Pending') newStatus = 'En attente';
    else if (abResult.status === 'Partial') newStatus = 'Partiel';
    else if (abResult.status === 'Canceled') newStatus = 'Annulé';
    else if (abResult.status === 'Processing') newStatus = 'Traitement';
    await db.collection('advancedOrders').doc(orderId).update({
      status: newStatus,
      providerStatus: abResult.status,
      providerCharge: abResult.charge,
      providerStartCount: abResult.start_count,
      providerRemains: abResult.remains,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({
      success: true,
      orderId, status: newStatus,
      providerStatus: abResult.status,
      startCount: abResult.start_count,
      remains: abResult.remains,
      charge: abResult.charge
    });
  } catch (error) {
    console.error('Erreur statut AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/afriqueboost/refill
app.post('/api/afriqueboost/refill', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    const orderDoc = await db.collection('advancedOrders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    const orderData = orderDoc.data();
    if (orderData.userId !== userId) return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    if (orderData.provider !== 'afriqueboost') return res.status(400).json({ success: false, error: 'Commande non AfriqueBoost' });
    const abResult = await callAfriqueBoostAPI({ action: 'refill', order: orderData.providerOrderId.toString() });
    if (abResult.error) return res.status(500).json({ success: false, error: abResult.error });
    await db.collection('advancedOrders').doc(orderId).update({
      refillRequested: true,
      refillId: abResult.refill || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, refillId: abResult.refill, message: 'Demande de recharge envoyée' });
  } catch (error) {
    console.error('Erreur refill AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/afriqueboost/cancel
app.post('/api/afriqueboost/cancel', authenticateMTP, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.userId;
    const orderDoc = await db.collection('advancedOrders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    const orderData = orderDoc.data();
    if (orderData.userId !== userId) return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    if (orderData.provider !== 'afriqueboost') return res.status(400).json({ success: false, error: 'Commande non AfriqueBoost' });
    const abResult = await callAfriqueBoostAPI({ action: 'cancel', orders: orderData.providerOrderId.toString() });
    if (abResult.error) return res.status(500).json({ success: false, error: abResult.error });
    const userRef = db.collection('users').doc(userId);
    await userRef.update({ balance: admin.firestore.FieldValue.increment(orderData.priceXAF) });
    const userDoc2 = await userRef.get();
    const newBalance = (userDoc2.data().balance || 0);
    await db.collection('advancedOrders').doc(orderId).update({
      status: 'Annulé',
      providerStatus: 'Canceled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true, orderId, newBalance, refundedAmount: orderData.priceXAF, message: 'Commande annulée et remboursée' });
  } catch (error) {
    console.error('Erreur annulation AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/afriqueboost/user-orders
app.get('/api/afriqueboost/user-orders', authenticateMTP, async (req, res) => {
  try {
    const userId = req.userId;
    const ordersSnapshot = await db.collection('advancedOrders')
      .where('userId', '==', userId)
      .where('provider', '==', 'afriqueboost')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const orders = [];
    ordersSnapshot.forEach(doc => {
      const data = doc.data();
      orders.push({
        orderId: data.orderId,
        serviceName: data.serviceName,
        link: data.link,
        quantity: data.quantity,
        priceXAF: data.priceXAF,
        status: data.status,
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        providerOrderId: data.providerOrderId,
        startCount: data.providerStartCount || data.startCount || null,
        remains: data.providerRemains || null
      });
    });
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Erreur récupération commandes AfriqueBoost:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Middleware de gestion d'erreurs pour toutes les routes non trouvées
app.use('/api/*', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(404).json({ 
    success: false, 
    error: `Endpoint ${req.method} ${req.originalUrl} non trouvé` 
  });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.setHeader('Content-Type', 'application/json');
  res.status(500).json({ 
    success: false, 
    error: 'Erreur interne du serveur',
    message: err.message
  });
});

// ─── 404 POUR ROUTES NON TROUVÉES ───────────────────────────────────────
app.use('*', (_req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Route non trouvée'
  });
});

// CRON: Vérification des statuts AfriqueBoost toutes les 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log('🔄 Vérification statuts commandes AfriqueBoost...');
  try {
    const pendingOrders = await db.collection('advancedOrders')
      .where('provider', '==', 'afriqueboost')
      .where('status', 'in', ['En cours', 'En attente', 'Traitement'])
      .limit(50)
      .get();
    if (pendingOrders.empty) {
      console.log('✅ Aucune commande AfriqueBoost en attente');
      return;
    }
    const abOrders = [];
    const abOrderMap = {};
    pendingOrders.forEach(doc => {
      const data = doc.data();
      if (data.providerOrderId) {
        abOrders.push(data.providerOrderId.toString());
        abOrderMap[data.providerOrderId] = doc.id;
      }
    });
    if (abOrders.length > 0) {
      const abResult = await callAfriqueBoostAPI({ action: 'status', orders: abOrders.join(',') });
      for (const [provId, statusData] of Object.entries(abResult)) {
        const orderId = abOrderMap[provId];
        if (!orderId || statusData.error) continue;
        let newStatus = 'En cours';
        if (statusData.status === 'Completed') newStatus = 'Terminé';
        else if (statusData.status === 'In progress') newStatus = 'En cours';
        else if (statusData.status === 'Pending') newStatus = 'En attente';
        else if (statusData.status === 'Partial') newStatus = 'Partiel';
        else if (statusData.status === 'Canceled') newStatus = 'Annulé';
        else if (statusData.status === 'Processing') newStatus = 'Traitement';

        if (statusData.status === 'Canceled' || statusData.status === 'Partial') {
          const orderDocSnap = await db.collection('advancedOrders').doc(orderId).get();
          if (orderDocSnap.exists) {
            await processAutoRefund(orderDocSnap, statusData, 'afriqueboost', 'advancedOrders');
          }
        } else {
          await db.collection('advancedOrders').doc(orderId).update({
            status: newStatus,
            providerStatus: statusData.status,
            providerCharge: statusData.charge,
            providerRemains: statusData.remains,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
      console.log(`✅ ${abOrders.length} commandes AfriqueBoost vérifiées`);
    }
  } catch (error) {
    console.error('Erreur vérification statuts AfriqueBoost:', error);
  }
});
console.log('⏰ Tâche automatique configurée: Vérification commandes AfriqueBoost toutes les 10 minutes');

// Gestion des erreurs non capturées pour debug
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

// ─── DÉMARRAGE DU SERVEUR ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveur en écoute sur le port ${PORT}`);
});
