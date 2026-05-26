/**
 * scripts/seedNadra.js
 * ──────────────────────────────────────────────────────────────────────────
 * One-time script: populates 15 sample CNIC records into the Firestore
 * collection `NADRA_Mock_DB`.
 *
 * Run from the create_committee/ directory:
 *   node scripts/seedNadra.js
 *
 * Requires firebase-admin (uses service-account key) OR the existing
 * firebase SDK with write permissions already configured.
 * ──────────────────────────────────────────────────────────────────────────
 */

// We use the firebase SDK already configured in firebaseConfig.js so we don't
// need an extra admin SDK or service account for local dev.
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, doc, setDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey:            "AIzaSyA7OqBbsMCDS_EOZbMsfORaPYniIiJW9kg",
  authDomain:        "com1-e2378.firebaseapp.com",
  databaseURL:       "https://com1-e2378-default-rtdb.firebaseio.com",
  projectId:         "com1-e2378",
  storageBucket:     "com1-e2378.firebasestorage.app",
  messagingSenderId: "892245769326",
  appId:             "1:892245769326:web:c5bdd7ff6277988120ba7f",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── 15 realistic-looking Pakistani CNIC records ────────────────────────────
// Format: 13-digit string  (XXXXX-XXXXXXX-X)  stored as key without dashes.
const NADRA_RECORDS = [
  { cnic: "3520212345671", fullName: "Ali Hassan Khan",      dob: "1990-05-14", isActive: true  },
  { cnic: "3520298765432", fullName: "Sara Ahmed Siddiqui",  dob: "1992-11-22", isActive: true  },
  { cnic: "3460187654321", fullName: "Usman Ali Qureshi",    dob: "1985-03-08", isActive: true  },
  { cnic: "4220111234567", fullName: "Nadia Raza Mirza",     dob: "1995-07-30", isActive: false },
  { cnic: "3410256789012", fullName: "Hamza Malik Butt",     dob: "1988-09-19", isActive: true  },
  { cnic: "4200312345678", fullName: "Ayesha Noor Javed",    dob: "1993-01-05", isActive: true  },
  { cnic: "3630287654321", fullName: "Bilal Sheikh Abbasi",  dob: "1991-06-17", isActive: true  },
  { cnic: "3520398765432", fullName: "Hira Fatima Ansari",   dob: "1996-12-03", isActive: true  },
  { cnic: "6110212345671", fullName: "Zain Ali Hashmi",      dob: "1987-04-25", isActive: true  },
  { cnic: "3520198765438", fullName: "Mariam Khan Baloch",   dob: "1994-08-11", isActive: false },
  { cnic: "3840256789013", fullName: "Faisal Mehmood Rana",  dob: "1989-02-28", isActive: true  },
  { cnic: "3410367891234", fullName: "Komal Tariq Chaudhry", dob: "1997-10-16", isActive: true  },
  { cnic: "3520487654322", fullName: "Ahmad Raza Shah",      dob: "1983-06-09", isActive: true  },
  { cnic: "4220512345679", fullName: "Sonia Aslam Gillani",  dob: "1998-03-22", isActive: false },
  { cnic: "3630698765430", fullName: "Rehan Javed Niazi",    dob: "1986-11-14", isActive: true  },
];

async function seed() {
  console.log("Seeding NADRA_Mock_DB…");
  const col = collection(db, "NADRA_Mock_DB");

  for (const record of NADRA_RECORDS) {
    try {
      await setDoc(doc(col, record.cnic), {
        fullName: record.fullName,
        dob:      record.dob,
        isActive: record.isActive,
      });
      console.log(`  ✅ ${record.cnic}  —  ${record.fullName}  (active: ${record.isActive})`);
    } catch (err) {
      console.error(`  ❌ ${record.cnic}:`, err.message);
    }
  }

  console.log(`\nDone — ${NADRA_RECORDS.length} records written to NADRA_Mock_DB.`);
  process.exit(0);
}

seed();
