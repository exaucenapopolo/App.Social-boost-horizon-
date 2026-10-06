// Script pour vérifier et corriger les statuts des commandes
require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialiser Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeAndFixOrders() {
  console.log('🔍 Analyse des commandes...\n');
  
  try {
    const commandesRef = db.collection('commandes');
    const snapshot = await commandesRef.get();
    
    // Statistiques
    const stats = {
      total: 0,
      'En attente': 0,
      'en cours': 0,
      'succès': 0,
      'annulée': 0,
      'autres': 0
    };
    
    const ordersToFix = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;
      
      const status = data.status || 'N/A';
      if (stats[status] !== undefined) {
        stats[status]++;
      } else {
        stats['autres']++;
      }
      
      // Collecter les commandes à corriger
      if (status === 'En attente' || status === 'en cours') {
        const createdAt = data.createdAt ? data.createdAt.toDate() : null;
        const now = new Date();
        const ageInMinutes = createdAt ? Math.floor((now - createdAt) / (1000 * 60)) : 0;
        
        // Si la commande a plus de 10 minutes et n'est pas encore en succès
        if (ageInMinutes > 10) {
          ordersToFix.push({
            id: doc.id,
            orderId: data.orderId,
            status: status,
            service: data.service,
            platform: data.platform,
            time: data.time,
            age: ageInMinutes,
            createdAt: createdAt
          });
        }
      }
    });
    
    // Afficher les statistiques
    console.log('📊 STATISTIQUES DES COMMANDES:');
    console.log('━'.repeat(50));
    console.log(`Total: ${stats.total}`);
    console.log(`En attente: ${stats['En attente']}`);
    console.log(`En cours: ${stats['en cours']}`);
    console.log(`Succès: ${stats['succès']}`);
    console.log(`Annulée: ${stats['annulée']}`);
    console.log(`Autres: ${stats['autres']}`);
    console.log('━'.repeat(50));
    
    // Afficher les commandes à corriger
    if (ordersToFix.length > 0) {
      console.log(`\n⚠️  ${ordersToFix.length} commandes à corriger (âge > 10 min):\n`);
      ordersToFix.forEach((order, idx) => {
        console.log(`${idx + 1}. Commande #${order.orderId}`);
        console.log(`   Status actuel: ${order.status}`);
        console.log(`   Service: ${order.platform} - ${order.service}`);
        console.log(`   Temps réalisation: ${order.time}`);
        console.log(`   Créée il y a: ${order.age} minutes`);
        console.log(`   Créée le: ${order.createdAt ? order.createdAt.toLocaleString('fr-FR') : 'N/A'}`);
        console.log('');
      });
      
      // Demander confirmation (en production, on peut automatiser)
      console.log('🔧 Correction des statuts en cours...\n');
      
      const batch = db.batch();
      ordersToFix.forEach(order => {
        const docRef = commandesRef.doc(order.id);
        batch.update(docRef, {
          status: 'succès',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoFixed: true,
          previousStatus: order.status
        });
      });
      
      await batch.commit();
      console.log(`✅ ${ordersToFix.length} commandes mises à jour vers "succès"\n`);
    } else {
      console.log('\n✅ Aucune commande à corriger\n');
    }
    
    // Afficher les commandes annulées d'hier
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const cancelledSnapshot = await commandesRef
      .where('status', '==', 'annulée')
      .get();
    
    const cancelledYesterday = [];
    cancelledSnapshot.forEach(doc => {
      const data = doc.data();
      const createdAt = data.createdAt ? data.createdAt.toDate() : null;
      if (createdAt && createdAt >= yesterday) {
        cancelledYesterday.push({
          orderId: data.orderId,
          cancelReason: data.cancelReason || 'Non spécifié',
          createdAt: createdAt
        });
      }
    });
    
    if (cancelledYesterday.length > 0) {
      console.log(`⚠️  ${cancelledYesterday.length} commandes annulées depuis hier:\n`);
      cancelledYesterday.forEach((order, idx) => {
        console.log(`${idx + 1}. Commande #${order.orderId}`);
        console.log(`   Raison: ${order.cancelReason}`);
        console.log(`   Date: ${order.createdAt.toLocaleString('fr-FR')}`);
        console.log('');
      });
    }
    
    console.log('✅ Analyse terminée!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }
}

analyzeAndFixOrders();
