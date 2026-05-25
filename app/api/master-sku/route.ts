import { NextResponse } from "next/server";
import Papa from "papaparse";

// LIVE master SKU feed for the OOS detector.
// Reads the "Maser Material Code" tab of the master workbook at request time
// and maps every SKU to its Material Group Code (col G) + Name (col H), so the
// dashboard counts coverage per group (42), not per SKU (97). FOC items are
// excluded. If the sheet is unreachable, it falls back to the baked-in 42-group
// snapshot below, so the endpoint never breaks.

type MasterSKU = {
  code: string;
  name: string;
  brand: string;
  subBrand: string;
  groupCode: string;
  groupName: string;
};

// Source sheet (override in Vercel with NEXT_PUBLIC_MATERIAL_URL / _GID).
const MATERIAL_URL =
  process.env.NEXT_PUBLIC_MATERIAL_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQHX9l23tQeTomduyJwli60oxoKCFDC388o9qcj1qdC4d9sJDBeKkovIzxKzpo4P7zT_W5bwtF3jPc4/pubhtml";
const MATERIAL_GID = process.env.NEXT_PUBLIC_MATERIAL_GID || "202207064";

const FALLBACK_SKUS: MasterSKU[] = [
  {
    "code": "101341233",
    "name": "Similac Mum Gold Vanilla VN 900G 1X12",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101341233",
    "groupName": "Similac Mum Gold Vanilla VN 900G 1X12"
  },
  {
    "code": "100889147",
    "name": "Ensure Gold (HMB) 850g",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286782",
    "groupName": "ENSURE VANILLA ARMOUR 800G 1X12"
  },
  {
    "code": "101047100",
    "name": "Glucerna Gladiator Vanilla 850g",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101267749",
    "groupName": "GLUCERNA Gladiator Vanilla 800G 1X12"
  },
  {
    "code": "101230551",
    "name": "Glucerna Gladiator Vanilla 850g SG",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101267749",
    "groupName": "GLUCERNA Gladiator Vanilla 800G 1X12"
  },
  {
    "code": "100602568",
    "name": "Glucerna Triple Care 850g",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101267749",
    "groupName": "GLUCERNA Gladiator Vanilla 800G 1X12"
  },
  {
    "code": "101341232",
    "name": "Similac Mum Gold Vanilla VN 400G 1X24",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101341232",
    "groupName": "Similac Mum Gold Vanilla VN 400G 1X24"
  },
  {
    "code": "101337623",
    "name": "PEDIASURE RPB ML2 Van 220ML 1X24",
    "brand": "PED",
    "subBrand": "PED RPB",
    "groupCode": "101337623",
    "groupName": "PEDIASURE RPB ML2 Van 220ML 1X24"
  },
  {
    "code": "101134402",
    "name": "Pediasure RPB Vanilla 220ML",
    "brand": "PED",
    "subBrand": "PED RPB",
    "groupCode": "101337623",
    "groupName": "PEDIASURE RPB ML2 Van 220ML 1X24"
  },
  {
    "code": "100910043",
    "name": "Similac Infant Stage 1 850g (HMO)",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267619",
    "groupName": "Similac Stage 1 Einstein 800G 1X12"
  },
  {
    "code": "100965276",
    "name": "Similac Infant Stage 1 850g (HMO) New",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267619",
    "groupName": "Similac Stage 1 Einstein 800G 1X12"
  },
  {
    "code": "101317674",
    "name": "ENSURE VANILLA RPB ARMOUR 220ML 1X24",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101317674",
    "groupName": "ENSURE VANILLA RPB ARMOUR 220ML 1X24"
  },
  {
    "code": "101140068",
    "name": "Similac Infant Stage 1 850G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267619",
    "groupName": "Similac Stage 1 Einstein 800G 1X12"
  },
  {
    "code": "101317644",
    "name": "GLUCERNA Vanilla PH 400G 1X24",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101317644",
    "groupName": "GLUCERNA Vanilla PH 400G 1X24"
  },
  {
    "code": "100889146",
    "name": "Ensure Gold (HMB) 400g",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286781",
    "groupName": "ENSURE VANILLA ARMOUR 380G 1X24"
  },
  {
    "code": "101248208",
    "name": "Pediasure Petronas (ML2) 850g",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101364509",
    "groupName": "PediaSure Milky Flavor 800g 1x12"
  },
  {
    "code": "101286782",
    "name": "ENSURE VANILLA ARMOUR 800G 1X12",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286782",
    "groupName": "ENSURE VANILLA ARMOUR 800G 1X12"
  },
  {
    "code": "101264762",
    "name": "Ensure Gold (HMB) 380g",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286781",
    "groupName": "ENSURE VANILLA ARMOUR 380G 1X24"
  },
  {
    "code": "101124746",
    "name": "ENSURE VANILLA 220ML",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101286782",
    "groupName": "ENSURE VANILLA ARMOUR 800G 1X12"
  },
  {
    "code": "101286781",
    "name": "ENSURE VANILLA ARMOUR 380G 1X24",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286781",
    "groupName": "ENSURE VANILLA ARMOUR 380G 1X24"
  },
  {
    "code": "101286610",
    "name": "ENSURE Wheat ARMOUR 800G 1X12",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286610",
    "groupName": "ENSURE Wheat ARMOUR 800G 1X12"
  },
  {
    "code": "101281027",
    "name": "Pediasure Petronas (ML2) 800G 1X12",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101364509",
    "groupName": "PediaSure Milky Flavor 800g 1x12"
  },
  {
    "code": "101126409",
    "name": "ENSURE CHOCOLATE 220ML",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101317674",
    "groupName": "ENSURE VANILLA RPB ARMOUR 220ML 1X24"
  },
  {
    "code": "101126511",
    "name": "ENSURE GOLD COFFEE 220ML",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101317674",
    "groupName": "ENSURE VANILLA RPB ARMOUR 220ML 1X24"
  },
  {
    "code": "101005389",
    "name": "Ensure Gold RPB Vanilla 237ML",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101317674",
    "groupName": "ENSURE VANILLA RPB ARMOUR 220ML 1X24"
  },
  {
    "code": "100889150",
    "name": "Ensure RPB Chocolate 237ML",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101317674",
    "groupName": "ENSURE VANILLA RPB ARMOUR 220ML 1X24"
  },
  {
    "code": "100889149",
    "name": "Ensure RPB Strawberry 237ML",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101317674",
    "groupName": "ENSURE VANILLA RPB ARMOUR 220ML 1X24"
  },
  {
    "code": "101092737",
    "name": "Pediasure Petronas (Sucrose Free) 850g",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101364509",
    "groupName": "PediaSure Milky Flavor 800g 1x12"
  },
  {
    "code": "101279606",
    "name": "GLUCERNA GLADIATOR LIQUID 220ML SG",
    "brand": "GLU",
    "subBrand": "GLU RPB",
    "groupCode": "101279606",
    "groupName": "GLUCERNA GLADIATOR LIQUID 220ML SG"
  },
  {
    "code": "101267749",
    "name": "Glucerna Gladiator Vanilla 800g SG",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101267749",
    "groupName": "Glucerna Gladiator Vanilla 800g SG"
  },
  {
    "code": "101247375",
    "name": "ENSURE GOLD GIFTPACK 400g x 2 tins",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101267749",
    "groupName": "Glucerna Gladiator Vanilla 800g SG"
  },
  {
    "code": "101267646",
    "name": "Similac Stage 1 Einstein 380G 1X24",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267646",
    "groupName": "Similac Stage 1 Einstein 380G 1X24"
  },
  {
    "code": "101168429",
    "name": "PEDIASURE 1+ VANILLA 850G",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101267644",
    "groupName": "PEDIASURE 1+ VANILLA 800G 1X12"
  },
  {
    "code": "101267645",
    "name": "PEDIASURE VANILLA 3+ 800G",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101267645",
    "groupName": "PEDIASURE VANILLA 3+ 800G"
  },
  {
    "code": "101267644",
    "name": "PEDIASURE 1+ VANILLA 800G",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101267644",
    "groupName": "PEDIASURE 1+ VANILLA 800G"
  },
  {
    "code": "100965460",
    "name": "Similac Gain Kid 850g (HMO) New",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267643",
    "groupName": "Similac Gain Kid Einstein 800G 1X12"
  },
  {
    "code": "101267643",
    "name": "Similac Gain Kid 800G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267643",
    "groupName": "Similac Gain Kid 800G Einstein"
  },
  {
    "code": "100965279",
    "name": "Similac Gain IQ 850g (HMO) New",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267642",
    "groupName": "Similac Gain IQ Einstein 800G 1X12"
  },
  {
    "code": "100910047",
    "name": "Similac Gain Kid 850g (HMO)",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267643",
    "groupName": "Similac Gain Kid 800G Einstein"
  },
  {
    "code": "101267642",
    "name": "Similac Gain IQ Einstein 800G 1X12",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267642",
    "groupName": "Similac Gain IQ Einstein 800G 1X12"
  },
  {
    "code": "101192288",
    "name": "Ensure RM Bundle Pack 850g x 2 tins",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101192288",
    "groupName": "Ensure RM Bundle Pack 850g x 2 tins"
  },
  {
    "code": "101267640",
    "name": "Similac Stage 2 800G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267640",
    "groupName": "Similac Stage 2 800G Einstein"
  },
  {
    "code": "101168473",
    "name": "PEDIASURE VANILLA 3+ 850G",
    "brand": "PED",
    "subBrand": "PED PWD",
    "groupCode": "101267645",
    "groupName": "PEDIASURE 3+ VANILLA 800G 1X12"
  },
  {
    "code": "100910045",
    "name": "Similac Stage 2 850g (HMO)",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267640",
    "groupName": "Similac Stage 2 800G Einstein"
  },
  {
    "code": "100965278",
    "name": "Similac Stage 2 850g (HMO) New",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267640",
    "groupName": "Similac Stage 2 800G Einstein"
  },
  {
    "code": "101267619",
    "name": "Similac Stage 1 Einstein 800G 1X12",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267619",
    "groupName": "Similac Stage 1 Einstein 800G 1X12"
  },
  {
    "code": "101140070",
    "name": "Similac Stage 2 850G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267640",
    "groupName": "Similac Stage 2 Einstein 800G 1X12"
  },
  {
    "code": "101264760",
    "name": "GLUCERNA WHEAT 800G",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101264760",
    "groupName": "GLUCERNA WHEAT 800G"
  },
  {
    "code": "101304303",
    "name": "GLUCERNA GLADIATOR RPB 220ML 1X15",
    "brand": "GLU",
    "subBrand": "GLU RPB",
    "groupCode": "101304303",
    "groupName": "GLUCERNA GLADIATOR RPB 220ML 1X15"
  },
  {
    "code": "101240409",
    "name": "Similac Total Comfort Stage 3 (HMO) 820g",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240409",
    "groupName": "Similac Total Comfort Stage 3 (HMO) 820g"
  },
  {
    "code": "101240405",
    "name": "Similac Total Comfort S2 (HMO) 820g New",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240405",
    "groupName": "Similac Total Comfort S2 (HMO) 820g New"
  },
  {
    "code": "101240403",
    "name": "Similac Total Comfort S1 (HMO) 820g New",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240403",
    "groupName": "Similac Total Comfort S1 (HMO) 820g New"
  },
  {
    "code": "101240402",
    "name": "Similac Total Comfort S1 (HMO) 360g New",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240402",
    "groupName": "Similac Total Comfort S1 (HMO) 360g New"
  },
  {
    "code": "101087548",
    "name": "Ensure Gold Wheat Flavor 850g",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101267780",
    "groupName": "ENSURE Gold Wheat 800G 1X12"
  },
  {
    "code": "101140073",
    "name": "Similac Gain Kid 850G_Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267643",
    "groupName": "Similac Gain Kid Einstein 800G 1X12"
  },
  {
    "code": "101230553",
    "name": "Similac Gain IQ Vanilla 180ml Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101230553",
    "groupName": "Similac Gain IQ Vanilla 180ml Einstein"
  },
  {
    "code": "101230094",
    "name": "Ensure Gold RPB 6 Bundle Pack",
    "brand": "ENS",
    "subBrand": "ENS RPB",
    "groupCode": "101230094",
    "groupName": "Ensure Gold RPB 6 Bundle Pack"
  },
  {
    "code": "101230550",
    "name": "Glucerna Gladiator Vanilla 400g SG",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101317644",
    "groupName": "GLUCERNA Vanilla PH 400G 1X24"
  },
  {
    "code": "101147839",
    "name": "GLUCERNA WHEAT 850G",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101264760",
    "groupName": "GLUCERNA WHEAT 800G 1X12"
  },
  {
    "code": "101230552",
    "name": "GLUCERNA WHEAT 850G SG",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101264760",
    "groupName": "GLUCERNA WHEAT 800G 1X12"
  },
  {
    "code": "101140069",
    "name": "Similac Stage 2 400G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101140069",
    "groupName": "Similac Stage 2 400G Einstein"
  },
  {
    "code": "101046959",
    "name": "Glucerna Gladiator Vanilla 400g",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101317644",
    "groupName": "GLUCERNA Vanilla PH 400G 1X24"
  },
  {
    "code": "101131388",
    "name": "PROSURE ORANGE 380G",
    "brand": "PRO",
    "subBrand": "PRO",
    "groupCode": "101131388",
    "groupName": "PROSURE ORANGE 380G"
  },
  {
    "code": "100889140",
    "name": "Similac Total Comfort Stage 1 (HMO) 820g",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240403",
    "groupName": "Similac Total Comfort S1 (HMO) 820g 1X12"
  },
  {
    "code": "100888859",
    "name": "Similac Total Comfort Stage 1 (HMO) 360g",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240402",
    "groupName": "Similac Total Comfort S1 (HMO) 360g 1X24"
  },
  {
    "code": "101092736",
    "name": "Similac Gain IQ Vanilla 180ml",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101092736",
    "groupName": "Similac Gain IQ Vanilla 180ml"
  },
  {
    "code": "100965400",
    "name": "Similac Infant Stage 1 400g (HMO) Europe",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267646",
    "groupName": "Similac Stage 1 Einstein 380G 1X24"
  },
  {
    "code": "100910042",
    "name": "Similac Infant Stage 1 400g (HMO) SG",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267646",
    "groupName": "Similac Stage 1 Einstein 380G 1X24"
  },
  {
    "code": "101023368",
    "name": "Similac Mum Gold Vanilla 900g",
    "brand": "SM",
    "subBrand": "SM",
    "groupCode": "101341233",
    "groupName": "SIMILAC Mum Vanilla 900G 1X12"
  },
  {
    "code": "101087549",
    "name": "Ensure Gold Coffee Flavor 850g",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286782",
    "groupName": "ENSURE VANILLA ARMOUR 800G 1X12"
  },
  {
    "code": "101023367",
    "name": "Sim Mum Gold Strawberry 400g",
    "brand": "SM",
    "subBrand": "SM",
    "groupCode": "101023367",
    "groupName": "Sim Mum Gold Strawberry 400g"
  },
  {
    "code": "100679827",
    "name": "Pediasure Complete RPB Vanilla 237ML",
    "brand": "PED",
    "subBrand": "PED RPB",
    "groupCode": "101337623",
    "groupName": "PEDIASURE RPB ML2 Van 220ML 1X24"
  },
  {
    "code": "101079727",
    "name": "Pediasure MRI Vanilla Unique Label 237ML",
    "brand": "PED",
    "subBrand": "PED RPB",
    "groupCode": "101337623",
    "groupName": "PEDIASURE RPB ML2 Van 220ML 1X24"
  },
  {
    "code": "101023366",
    "name": "Similac Mum Gold Vanilla 400g",
    "brand": "SM",
    "subBrand": "SM",
    "groupCode": "101341232",
    "groupName": "SIMILAC Mum Vanilla 400G 1X24"
  },
  {
    "code": "100965277",
    "name": "Similac Stage 2 400g (HMO) New",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "100965277",
    "groupName": "Similac Stage 2 400g (HMO) New"
  },
  {
    "code": "100910044",
    "name": "Similac Stage 2 400g (HMO)",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "100910044",
    "groupName": "Similac Stage 2 400g (HMO)"
  },
  {
    "code": "101267811",
    "name": "Glucerna Gladiator Vanilla 380g SG",
    "brand": "GLU",
    "subBrand": "GLU PWD",
    "groupCode": "101317644",
    "groupName": "GLUCERNA Vanilla PH 400G 1X24"
  },
  {
    "code": "100889141",
    "name": "Similac Total Comfort Stage 2 (HMO) 820g",
    "brand": "STC",
    "subBrand": "STC",
    "groupCode": "101240405",
    "groupName": "Similac Total Comfort S2 (HMO) 820g 1X12"
  },
  {
    "code": "100872436",
    "name": "Similac Mum NVE Strawberry 400g",
    "brand": "SM",
    "subBrand": "SM",
    "groupCode": "100872436",
    "groupName": "Similac Mum NVE Strawberry 400g"
  },
  {
    "code": "100807449",
    "name": "Isomil 1 Advance 400g (New)",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "100807449",
    "groupName": "Isomil 1 Advance 400g (New)"
  },
  {
    "code": "101126533",
    "name": "GLUCERNA GLADIATOR LIQUID 220ML",
    "brand": "GLU",
    "subBrand": "GLU RPB",
    "groupCode": "101279606",
    "groupName": "GLUCERNA GLADIATOR RPB 220ML 1X30"
  },
  {
    "code": "101267781",
    "name": "ENSURE VANILLA 800G 1X12",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101286782",
    "groupName": "ENSURE VANILLA ARMOUR 800G 1X12"
  },
  {
    "code": "101140066",
    "name": "Similac Infant Stage 1 400G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267646",
    "groupName": "Similac Stage 1 Einstein 380G 1X24"
  },
  {
    "code": "100632542",
    "name": "Isomil 2 Advance 850g",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "100632542",
    "groupName": "Isomil 2 Advance 850g"
  },
  {
    "code": "101267780",
    "name": "Ensure Gold Wheat Flavor 800g",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101267780",
    "groupName": "ENSURE Gold Wheat 800G 1X12"
  },
  {
    "code": "101140071",
    "name": "Similac Gain IQ 850G Einstein",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101267642",
    "groupName": "Similac Gain IQ Einstein 800G 1X12"
  },
  {
    "code": "101367614",
    "name": "ENSURE SP Wheat 800G 1X12",
    "brand": "ENS",
    "subBrand": "ENS PWD",
    "groupCode": "101367614",
    "groupName": "ENSURE SP Wheat 800G 1X12"
  },
  {
    "code": "101369996",
    "name": "PROSURE ORANGE 380G 1X24",
    "brand": "PRO",
    "subBrand": "PRO PWD",
    "groupCode": "101369996",
    "groupName": "PROSURE ORANGE 380G 1X24"
  },
  {
    "code": "101371278",
    "name": "SIMILAC Total Protection 1 800g 1x12",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101371278",
    "groupName": "SIMILAC Total Protection 1 800g 1x12"
  },
  {
    "code": "101371460",
    "name": "SIMILAC Total Protection 2 800g 1x12",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101371460",
    "groupName": "SIMILAC Total Protection 2 800g 1x12"
  },
  {
    "code": "101371461",
    "name": "SIMILAC Total Protection 3 800g 1x12",
    "brand": "SIM",
    "subBrand": "SIM",
    "groupCode": "101371461",
    "groupName": "SIMILAC Total Protection 3 800g 1x12"
  }
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Turn any Google Sheets URL into a CSV export URL for a given tab gid.
function toCsvUrl(rawUrl: string, gid: string): string {
  const url = (rawUrl || "").trim();
  if (!url) return "";
  if (/output=csv|format=csv/.test(url)) {
    return /[?&]gid=/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}gid=${gid}`;
  }
  const pub = url.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  if (pub) {
    return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv&gid=${encodeURIComponent(gid)}&single=true`;
  }
  const reg = url.match(/\/spreadsheets\/d\/([^/]+)/);
  if (reg) {
    return `https://docs.google.com/spreadsheets/d/${reg[1]}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  }
  return url;
}

// "210148791.0" -> "210148791"; trims thousands separators / spaces.
function cleanCode(v: unknown): string {
  let s = String(v ?? "").trim().replace(/[,\s]/g, "");
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s;
}

function findIdx(header: string[], names: string[]): number {
  const norm = header.map((h) => String(h).trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

function parseMaster(csv: string): MasterSKU[] {
  const grid = (Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" }).data as string[][]).filter(
    (r) => Array.isArray(r) && r.some((c) => String(c).trim() !== "")
  );
  if (!grid.length) return [];
  // Find the header row (the one that actually names the columns).
  let h = 0;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    if (grid[i].some((c) => /material\s*group\s*code/i.test(String(c)))) { h = i; break; }
  }
  const header = grid[h];
  const codeI = findIdx(header, ["material code", "code"]);
  const nameI = findIdx(header, ["material name", "name", "description"]);
  const brandI = findIdx(header, ["brand"]);
  const subI = findIdx(header, ["sub-brand", "sub brand", "subbrand"]);
  const gCodeI = findIdx(header, ["material group code", "group code"]);
  const gNameI = findIdx(header, ["material group name", "group name"]);
  if (codeI < 0 || gCodeI < 0) return [];

  const out: MasterSKU[] = [];
  for (let r = h + 1; r < grid.length; r++) {
    const row = grid[r];
    const code = cleanCode(row[codeI]);
    const name = String(row[nameI] ?? "").trim();
    if (!code || !name) continue;
    if (name.toUpperCase().endsWith("FOC")) continue; // drop free-of-charge items
    const brand = String(row[brandI] ?? "").trim() || "Other";
    out.push({
      code,
      name,
      brand,
      subBrand: String(row[subI] ?? "").trim() || brand,
      groupCode: cleanCode(row[gCodeI]) || code,
      groupName: String(row[gNameI] ?? "").trim() || name,
    });
  }
  return out;
}

export async function GET() {
  try {
    const csvUrl = toCsvUrl(MATERIAL_URL, MATERIAL_GID);
    const res = await fetch(csvUrl, {
      cache: "no-store",
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (dashboard-proxy)" },
    });
    if (res.ok) {
      const text = await res.text();
      // Google returns an HTML page when a sheet isn't published.
      if (!/^\s*<(!doctype|html)/i.test(text)) {
        const live = parseMaster(text);
        if (live.length) {
          return NextResponse.json({ skuList: live, source: "live", count: live.length });
        }
      }
    }
  } catch {
    // fall through to snapshot
  }
  return NextResponse.json({ skuList: FALLBACK_SKUS, source: "fallback", count: FALLBACK_SKUS.length });
}
