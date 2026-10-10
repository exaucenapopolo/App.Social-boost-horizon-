const fs = require('fs');
const p = 'app/(tabs)/new-order.tsx';
let c = fs.readFileSync(p, 'utf8');
let count = 0;

function replaceAll(label, search, replace) {
  const before = c;
  c = c.split(search).join(replace);
  if (c !== before) {
    count++;
    console.log('✓ ' + label);
  } else {
    console.log('⚠ Introuvable : ' + label);
  }
}

// FIX 1a — Retirer l'animation glow (crash Android : shadowRadius animé)
replaceAll(
  'FIX 1a — retrait glow',
  `  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const glowShadow = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 24],
  });
`,
  '  // (animation glow retirée pour éviter un crash Android)\n'
);

// FIX 1b — Remplacer le shadowRadius animé par un static
replaceAll(
  'FIX 1b — shadowRadius static',
  'shadowRadius: glowShadow as any,',
  'shadowRadius: 14,'
);

// FIX 2 — Auto-charger les services quand McSearch s'ouvre sans catalogue
replaceAll(
  'FIX 2 — auto-load McSearch',
  `  // ═══════════════════════════════════════════════════════════════
  //  HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const handleSelectOrderType = (typeKey: string) => {`,
  `  // ═══ FIX : Charge les services si McSearch est ouvert sans catalogue ═══
  useEffect(() => {
    if (showMcSearch && platforms.length === 0 && !loadingServices) {
      loadServices("automatique");
    }
  }, [showMcSearch, platforms.length, loadingServices, loadServices]);

  // ═══════════════════════════════════════════════════════════════
  //  HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const handleSelectOrderType = (typeKey: string) => {`
);

fs.writeFileSync(p, c, 'utf8');
console.log('\n✅ Total : ' + count + ' corrections appliquées.');
