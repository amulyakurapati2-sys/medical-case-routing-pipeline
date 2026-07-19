/**
 * Idempotent specialist seed data.
 *
 * Seeds ~8 specialists: CARDIOLOGY and NEPHROLOGY each have two people with
 * different profiles (so ranking between peers is visible); ORTHOPEDICS has a
 * single specialist on PTO (unassignable demo path). Safe to re-run via upsert.
 */
import { Department, PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

type SeedSpecialist = {
  id: string;
  name: string;
  title: string;
  department: Department;
  expertise: string[];
  profile: string;
  onPto: boolean;
  maxCapacity: number;
};

const SPECIALISTS: SeedSpecialist[] = [
  {
    id: "spec_cardio_hf",
    name: "Dr. Ava Chen",
    title: "Cardiologist",
    department: Department.CARDIOLOGY,
    expertise: ["heart-failure", "echocardiography", "cardiomyopathy"],
    profile:
      "Focuses on advanced heart-failure management, device therapy candidates, and longitudinal cardiomyopathy care. Prefers complex decompensated HF presentations over pure arrhythmia workups.",
    onPto: false,
    maxCapacity: 3,
  },
  {
    id: "spec_cardio_ep",
    name: "Dr. Marcus Reid",
    title: "Interventional Cardiologist / EP",
    department: Department.CARDIOLOGY,
    expertise: ["arrhythmia", "ablation", "pacemaker", "interventional"],
    profile:
      "Electrophysiology and interventional cardiology. Strong match for atrial fibrillation, VT, syncope workups, and catheter-based interventions rather than chronic HF titration.",
    onPto: false,
    maxCapacity: 3,
  },
  {
    id: "spec_neph_ckd",
    name: "Dr. Priya Nair",
    title: "Nephrologist",
    department: Department.NEPHROLOGY,
    expertise: ["ckd", "electrolytes", "hypertension"],
    profile:
      "Chronic kidney disease, electrolyte disorders, and resistant hypertension. Comfortable with progressive CKD staging and medical management before dialysis.",
    onPto: false,
    maxCapacity: 3,
  },
  {
    id: "spec_neph_dialysis",
    name: "Dr. Jordan Blake",
    title: "Nephrologist — Dialysis",
    department: Department.NEPHROLOGY,
    expertise: ["dialysis", "aki", "transplant-prep"],
    profile:
      "Acute kidney injury, inpatient dialysis initiation, and transplant preparation. Prefers rapidly evolving renal failure over stable outpatient CKD follow-up.",
    onPto: false,
    maxCapacity: 2,
  },
  {
    id: "spec_onc",
    name: "Dr. Elena Vargas",
    title: "Medical Oncologist",
    department: Department.ONCOLOGY,
    expertise: ["solid-tumors", "chemotherapy", "staging"],
    profile:
      "Solid tumor oncology with emphasis on staging discussions and systemic therapy planning for new cancer diagnoses.",
    onPto: false,
    maxCapacity: 3,
  },
  {
    id: "spec_neuro",
    name: "Dr. Sam Okonkwo",
    title: "Neurologist",
    department: Department.NEUROLOGY,
    expertise: ["stroke", "seizure", "headache"],
    profile:
      "General neurology covering stroke pathways, first-time seizures, and complex headache syndromes.",
    onPto: false,
    maxCapacity: 3,
  },
  {
    id: "spec_ortho_pto",
    name: "Dr. Chris Patel",
    title: "Orthopedic Surgeon",
    department: Department.ORTHOPEDICS,
    expertise: ["fracture", "joint", "trauma"],
    profile:
      "Orthopedic trauma and joint pathology. Currently the only orthopedics specialist in the demo roster.",
    onPto: true,
    maxCapacity: 2,
  },
  {
    id: "spec_general",
    name: "Dr. Riley Morgan",
    title: "Internist",
    department: Department.GENERAL,
    expertise: ["general-medicine", "triage", "comorbidity"],
    profile:
      "General internal medicine catch-all for undifferentiated or multi-system cases that do not clearly map to a single specialty.",
    onPto: false,
    maxCapacity: 5,
  },
];

async function main(): Promise<void> {
  for (const s of SPECIALISTS) {
    await prisma.specialist.upsert({
      where: { id: s.id },
      create: s,
      // Keep mutable runtime availability; only fresh rows receive seed PTO defaults.
      update: {
        name: s.name,
        title: s.title,
        department: s.department,
        expertise: s.expertise,
        profile: s.profile,
        maxCapacity: s.maxCapacity,
      },
    });
  }
  console.log(`Seeded ${SPECIALISTS.length} specialists (idempotent upsert).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
