/**
 * locations.js
 * Comprehensive list of 250+ Indian city/area coordinates
 * covering Tier-1, Tier-2, Tier-3 cities where Instamart operates.
 *
 * Used by server.js and the pan-India scanner.
 */

const ALL_LOCATIONS = [
  // ── BENGALURU ──────────────────────────────────────────────────────────────
  { id: 'blr_hsr',         city: 'Bengaluru', name: 'HSR Layout',              lat: 12.9116, lon: 77.6389 },
  { id: 'blr_indira',      city: 'Bengaluru', name: 'Indiranagar',             lat: 12.9784, lon: 77.6408 },
  { id: 'blr_kora',        city: 'Bengaluru', name: 'Koramangala',             lat: 12.9352, lon: 77.6245 },
  { id: 'blr_white',       city: 'Bengaluru', name: 'Whitefield',              lat: 12.9698, lon: 77.7499 },
  { id: 'blr_bellandur',   city: 'Bengaluru', name: 'Bellandur',               lat: 12.9304, lon: 77.6784 },
  { id: 'blr_ecity',       city: 'Bengaluru', name: 'Electronic City',         lat: 12.8452, lon: 77.6602 },
  { id: 'blr_sarjapur',    city: 'Bengaluru', name: 'Sarjapur Road',           lat: 12.9102, lon: 77.6835 },
  { id: 'blr_mara',        city: 'Bengaluru', name: 'Marathahalli',            lat: 12.9591, lon: 77.6974 },
  { id: 'blr_btm',         city: 'Bengaluru', name: 'BTM Layout',              lat: 12.9166, lon: 77.6101 },
  { id: 'blr_jpnagar',     city: 'Bengaluru', name: 'JP Nagar',                lat: 12.9063, lon: 77.5857 },
  { id: 'blr_jayanagar',   city: 'Bengaluru', name: 'Jayanagar',               lat: 12.9308, lon: 77.5838 },
  { id: 'blr_malles',      city: 'Bengaluru', name: 'Malleshwaram',            lat: 13.0031, lon: 77.5643 },
  { id: 'blr_hebbal',      city: 'Bengaluru', name: 'Hebbal',                  lat: 13.0358, lon: 77.5970 },
  { id: 'blr_yelahanka',   city: 'Bengaluru', name: 'Yelahanka',               lat: 13.1007, lon: 77.5963 },
  { id: 'blr_banas',       city: 'Bengaluru', name: 'Banashankari',            lat: 12.9255, lon: 77.5468 },
  { id: 'blr_rajajinagar', city: 'Bengaluru', name: 'Rajajinagar',             lat: 12.9878, lon: 77.5542 },
  { id: 'blr_mg',          city: 'Bengaluru', name: 'MG Road / Brigade Rd',    lat: 12.9716, lon: 77.6099 },
  { id: 'blr_bannergh',    city: 'Bengaluru', name: 'Bannerghatta Road',       lat: 12.8934, lon: 77.5978 },
  { id: 'blr_kengeri',     city: 'Bengaluru', name: 'Kengeri',                 lat: 12.9107, lon: 77.4902 },
  { id: 'blr_rvpuram',     city: 'Bengaluru', name: 'RV Nagar / Vijayanagar',  lat: 12.9617, lon: 77.5389 },

  // ── DELHI ──────────────────────────────────────────────────────────────────
  { id: 'del_cp',          city: 'Delhi', name: 'Connaught Place',             lat: 28.6304, lon: 77.2177 },
  { id: 'del_southex',     city: 'Delhi', name: 'South Extension',             lat: 28.5700, lon: 77.2220 },
  { id: 'del_saket',       city: 'Delhi', name: 'Saket',                       lat: 28.5245, lon: 77.2167 },
  { id: 'del_lajpat',      city: 'Delhi', name: 'Lajpat Nagar',               lat: 28.5677, lon: 77.2433 },
  { id: 'del_vasantkunj',  city: 'Delhi', name: 'Vasant Kunj',                 lat: 28.5293, lon: 77.1557 },
  { id: 'del_dwarka',      city: 'Delhi', name: 'Dwarka',                      lat: 28.5921, lon: 77.0460 },
  { id: 'del_rohini',      city: 'Delhi', name: 'Rohini',                      lat: 28.7166, lon: 77.1189 },
  { id: 'del_pitampura',   city: 'Delhi', name: 'Pitampura',                   lat: 28.6990, lon: 77.1384 },
  { id: 'del_karolbagh',   city: 'Delhi', name: 'Karol Bagh',                  lat: 28.6514, lon: 77.1907 },
  { id: 'del_janakpuri',   city: 'Delhi', name: 'Janakpuri',                   lat: 28.6219, lon: 77.0878 },
  { id: 'del_mayurvihar',  city: 'Delhi', name: 'Mayur Vihar',                 lat: 28.6085, lon: 77.2942 },
  { id: 'del_laxminagar',  city: 'Delhi', name: 'Laxmi Nagar',                 lat: 28.6310, lon: 77.2776 },
  { id: 'del_preet',       city: 'Delhi', name: 'Preet Vihar',                 lat: 28.6357, lon: 77.2940 },
  { id: 'del_shahdara',    city: 'Delhi', name: 'Shahdara',                    lat: 28.6724, lon: 77.2940 },
  { id: 'del_krishnanagar',city: 'Delhi', name: 'Krishna Nagar',               lat: 28.6543, lon: 77.2726 },
  { id: 'del_uttamnagar',  city: 'Delhi', name: 'Uttam Nagar',                 lat: 28.6212, lon: 77.0545 },
  { id: 'del_paschimvihar',city: 'Delhi', name: 'Paschim Vihar',               lat: 28.6718, lon: 77.0939 },
  { id: 'del_kalkaji',     city: 'Delhi', name: 'Kalkaji / Nehru Place',       lat: 28.5499, lon: 77.2588 },

  // ── GURUGRAM ───────────────────────────────────────────────────────────────
  { id: 'ggn_cyber',       city: 'Gurugram', name: 'DLF Cyber City',           lat: 28.4950, lon: 77.0890 },
  { id: 'ggn_golf',        city: 'Gurugram', name: 'Golf Course Road',         lat: 28.4601, lon: 77.1009 },
  { id: 'ggn_sec56',       city: 'Gurugram', name: 'Sector 56',                lat: 28.4285, lon: 77.0984 },
  { id: 'ggn_sohna',       city: 'Gurugram', name: 'Sohna Road',               lat: 28.4194, lon: 77.0378 },
  { id: 'ggn_sec29',       city: 'Gurugram', name: 'Huda City Centre',         lat: 28.4682, lon: 77.0628 },
  { id: 'ggn_palam',       city: 'Gurugram', name: 'Palam Vihar',              lat: 28.5100, lon: 77.0300 },
  { id: 'ggn_mgi',         city: 'Gurugram', name: 'MG Road / IFFCO Chowk',   lat: 28.4759, lon: 77.0784 },
  { id: 'ggn_sec14',       city: 'Gurugram', name: 'Sector 14 / Old DLF',     lat: 28.4732, lon: 77.0428 },
  { id: 'ggn_sushant',     city: 'Gurugram', name: 'Sushant Lok / DLF Ph1',   lat: 28.4630, lon: 77.0915 },
  { id: 'ggn_manesar',     city: 'Gurugram', name: 'Manesar',                  lat: 28.3556, lon: 76.9376 },

  // ── NOIDA & GREATER NOIDA ──────────────────────────────────────────────────
  { id: 'noida_sec18',     city: 'Noida', name: 'Sector 18',                   lat: 28.5708, lon: 77.3260 },
  { id: 'noida_sec62',     city: 'Noida', name: 'Sector 62 IT Hub',            lat: 28.6265, lon: 77.3622 },
  { id: 'noida_sec137',    city: 'Noida', name: 'Sector 137 Expressway',       lat: 28.5134, lon: 77.4042 },
  { id: 'noida_sec50',     city: 'Noida', name: 'Sector 50',                   lat: 28.5744, lon: 77.3688 },
  { id: 'noida_sec76',     city: 'Noida', name: 'Sector 76 / 78',              lat: 28.5683, lon: 77.3872 },
  { id: 'noida_sec110',    city: 'Noida', name: 'Sector 110 / 120',            lat: 28.5361, lon: 77.3925 },
  { id: 'gnoida_gaur',     city: 'Greater Noida', name: 'Gaur City',           lat: 28.6080, lon: 77.4270 },
  { id: 'gnoida_pari',     city: 'Greater Noida', name: 'Pari Chowk',          lat: 28.4674, lon: 77.5136 },
  { id: 'gnoida_knowledge',city: 'Greater Noida', name: 'Knowledge Park',      lat: 28.4746, lon: 77.5040 },

  // ── GHAZIABAD & FARIDABAD ──────────────────────────────────────────────────
  { id: 'gzb_indira',      city: 'Ghaziabad', name: 'Indirapuram',             lat: 28.6415, lon: 77.3714 },
  { id: 'gzb_vaishali',    city: 'Ghaziabad', name: 'Vaishali',                lat: 28.6476, lon: 77.3385 },
  { id: 'gzb_rajnagar',    city: 'Ghaziabad', name: 'Raj Nagar Extension',     lat: 28.7050, lon: 77.4290 },
  { id: 'gzb_kaushambi',   city: 'Ghaziabad', name: 'Kaushambi',               lat: 28.6444, lon: 77.3320 },
  { id: 'gzb_modinagar',   city: 'Ghaziabad', name: 'Modi Nagar',              lat: 28.8363, lon: 77.5800 },
  { id: 'fbd_sec15',       city: 'Faridabad', name: 'Sector 15',               lat: 28.4089, lon: 77.3178 },
  { id: 'fbd_nit',         city: 'Faridabad', name: 'NIT Faridabad',           lat: 28.3842, lon: 77.2980 },
  { id: 'fbd_sec21',       city: 'Faridabad', name: 'Sector 21D / Old Farid',  lat: 28.4035, lon: 77.3142 },

  // ── MUMBAI ─────────────────────────────────────────────────────────────────
  { id: 'mum_bandra_w',    city: 'Mumbai', name: 'Bandra West',                lat: 19.0596, lon: 72.8295 },
  { id: 'mum_andheri_w',   city: 'Mumbai', name: 'Andheri West',               lat: 19.1363, lon: 72.8277 },
  { id: 'mum_andheri_e',   city: 'Mumbai', name: 'Andheri East',               lat: 19.1136, lon: 72.8697 },
  { id: 'mum_powai',       city: 'Mumbai', name: 'Powai',                      lat: 19.1176, lon: 72.9060 },
  { id: 'mum_juhu',        city: 'Mumbai', name: 'Juhu',                       lat: 19.1075, lon: 72.8263 },
  { id: 'mum_lowerparel',  city: 'Mumbai', name: 'Lower Parel / Worli',        lat: 18.9986, lon: 72.8311 },
  { id: 'mum_dadar',       city: 'Mumbai', name: 'Dadar',                      lat: 19.0178, lon: 72.8478 },
  { id: 'mum_colaba',      city: 'Mumbai', name: 'Colaba',                     lat: 18.9220, lon: 72.8347 },
  { id: 'mum_borivali',    city: 'Mumbai', name: 'Borivali West',              lat: 19.2307, lon: 72.8567 },
  { id: 'mum_malad',       city: 'Mumbai', name: 'Malad West',                 lat: 19.1874, lon: 72.8484 },
  { id: 'mum_goregaon',    city: 'Mumbai', name: 'Goregaon East',              lat: 19.1663, lon: 72.8526 },
  { id: 'mum_chembur',     city: 'Mumbai', name: 'Chembur',                    lat: 19.0622, lon: 72.8978 },
  { id: 'mum_ghatkopar',   city: 'Mumbai', name: 'Ghatkopar East',             lat: 19.0860, lon: 72.9080 },
  { id: 'mum_mulund',      city: 'Mumbai', name: 'Mulund West',                lat: 19.1726, lon: 72.9425 },
  { id: 'mum_kandivali',   city: 'Mumbai', name: 'Kandivali West',             lat: 19.2054, lon: 72.8494 },
  { id: 'mum_santacruz',   city: 'Mumbai', name: 'Santacruz West',             lat: 19.0813, lon: 72.8388 },
  { id: 'mum_versova',     city: 'Mumbai', name: 'Versova / Four Bungalows',   lat: 19.1318, lon: 72.8089 },
  { id: 'mum_vikhroli',    city: 'Mumbai', name: 'Vikhroli / Kanjurmarg',      lat: 19.1125, lon: 72.9357 },
  { id: 'mum_kurla',       city: 'Mumbai', name: 'Kurla West',                 lat: 19.0651, lon: 72.8797 },
  { id: 'mum_sion',        city: 'Mumbai', name: 'Sion / Matunga',             lat: 19.0390, lon: 72.8619 },

  // ── THANE & NAVI MUMBAI ────────────────────────────────────────────────────
  { id: 'thane_ghodbunder',city: 'Thane', name: 'Ghodbunder Road',             lat: 19.2183, lon: 72.9781 },
  { id: 'thane_naupada',   city: 'Thane', name: 'Naupada / Thane West',        lat: 19.1872, lon: 72.9703 },
  { id: 'thane_teen',      city: 'Thane', name: 'Teen Hath Naka / Manpada',    lat: 19.2093, lon: 72.9782 },
  { id: 'nmum_vashi',      city: 'Navi Mumbai', name: 'Vashi',                 lat: 19.0771, lon: 72.9986 },
  { id: 'nmum_kopar',      city: 'Navi Mumbai', name: 'Kopar Khairane',        lat: 19.1026, lon: 73.0117 },
  { id: 'nmum_nerul',      city: 'Navi Mumbai', name: 'Nerul',                 lat: 19.0330, lon: 73.0297 },
  { id: 'nmum_kharghar',   city: 'Navi Mumbai', name: 'Kharghar',              lat: 19.0473, lon: 73.0699 },
  { id: 'nmum_panvel',     city: 'Navi Mumbai', name: 'Panvel',                lat: 18.9894, lon: 73.1175 },
  { id: 'nmum_airoli',     city: 'Navi Mumbai', name: 'Airoli',                lat: 19.1548, lon: 72.9999 },

  // ── HYDERABAD ──────────────────────────────────────────────────────────────
  { id: 'hyd_hitec',       city: 'Hyderabad', name: 'HITEC City',              lat: 17.4474, lon: 78.3762 },
  { id: 'hyd_gachi',       city: 'Hyderabad', name: 'Gachibowli',              lat: 17.4401, lon: 78.3489 },
  { id: 'hyd_kondapur',    city: 'Hyderabad', name: 'Kondapur',                lat: 17.4699, lon: 78.3578 },
  { id: 'hyd_banjara',     city: 'Hyderabad', name: 'Banjara Hills',           lat: 17.4156, lon: 78.4350 },
  { id: 'hyd_jubilee',     city: 'Hyderabad', name: 'Jubilee Hills',           lat: 17.4319, lon: 78.4073 },
  { id: 'hyd_kukatpally',  city: 'Hyderabad', name: 'Kukatpally',              lat: 17.4938, lon: 78.3995 },
  { id: 'hyd_secundera',   city: 'Hyderabad', name: 'Secunderabad',            lat: 17.4399, lon: 78.4983 },
  { id: 'hyd_begumpet',    city: 'Hyderabad', name: 'Begumpet',                lat: 17.4447, lon: 78.4664 },
  { id: 'hyd_dilsukh',     city: 'Hyderabad', name: 'Dilsukhnagar',            lat: 17.3688, lon: 78.5247 },
  { id: 'hyd_lbnagar',     city: 'Hyderabad', name: 'LB Nagar',                lat: 17.3491, lon: 78.5491 },
  { id: 'hyd_miyapur',     city: 'Hyderabad', name: 'Miyapur / Chandanagar',   lat: 17.4971, lon: 78.3372 },
  { id: 'hyd_manikonda',   city: 'Hyderabad', name: 'Manikonda',               lat: 17.4048, lon: 78.3864 },
  { id: 'hyd_nallagandla', city: 'Hyderabad', name: 'Nallagandla',             lat: 17.4545, lon: 78.3168 },
  { id: 'hyd_sainikpuri',  city: 'Hyderabad', name: 'Sainikpuri / Malkajgiri', lat: 17.4750, lon: 78.5435 },
  { id: 'hyd_uppal',       city: 'Hyderabad', name: 'Uppal',                   lat: 17.4054, lon: 78.5596 },
  { id: 'hyd_kompally',    city: 'Hyderabad', name: 'Kompally',                lat: 17.5454, lon: 78.4863 },

  // ── PUNE ───────────────────────────────────────────────────────────────────
  { id: 'pune_koregaon',   city: 'Pune', name: 'Koregaon Park',                lat: 18.5362, lon: 73.8940 },
  { id: 'pune_kalyani',    city: 'Pune', name: 'Kalyani Nagar',                lat: 18.5463, lon: 73.9033 },
  { id: 'pune_vimannagar', city: 'Pune', name: 'Viman Nagar',                  lat: 18.5679, lon: 73.9143 },
  { id: 'pune_baner',      city: 'Pune', name: 'Baner',                        lat: 18.5590, lon: 73.7868 },
  { id: 'pune_wakad',      city: 'Pune', name: 'Wakad / Pimple Saudagar',      lat: 18.5987, lon: 73.7688 },
  { id: 'pune_hinjewadi',  city: 'Pune', name: 'Hinjewadi IT Park',            lat: 18.5913, lon: 73.7389 },
  { id: 'pune_kothrud',    city: 'Pune', name: 'Kothrud',                      lat: 18.5074, lon: 73.8077 },
  { id: 'pune_hadapsar',   city: 'Pune', name: 'Hadapsar / Magarpatta',        lat: 18.5089, lon: 73.9260 },
  { id: 'pune_aundh',      city: 'Pune', name: 'Aundh',                        lat: 18.5602, lon: 73.8031 },
  { id: 'pune_shivaji',    city: 'Pune', name: 'Shivajinagar',                 lat: 18.5308, lon: 73.8475 },
  { id: 'pune_kondhwa',    city: 'Pune', name: 'Kondhwa / NIBM Road',          lat: 18.4706, lon: 73.8880 },
  { id: 'pune_wagholi',    city: 'Pune', name: 'Wagholi',                      lat: 18.5742, lon: 74.0019 },
  { id: 'pune_katraj',     city: 'Pune', name: 'Katraj / Dhayari',             lat: 18.4534, lon: 73.8513 },
  { id: 'pune_pimpri',     city: 'Pune', name: 'Pimpri-Chinchwad',             lat: 18.6278, lon: 73.8008 },

  // ── CHENNAI ────────────────────────────────────────────────────────────────
  { id: 'che_tnagar',      city: 'Chennai', name: 'T. Nagar',                  lat: 13.0418, lon: 80.2341 },
  { id: 'che_adyar',       city: 'Chennai', name: 'Adyar / Besant Nagar',      lat: 13.0012, lon: 80.2565 },
  { id: 'che_velachery',   city: 'Chennai', name: 'Velachery',                 lat: 12.9815, lon: 80.2180 },
  { id: 'che_annanagar',   city: 'Chennai', name: 'Anna Nagar',                lat: 13.0850, lon: 80.2101 },
  { id: 'che_omr',         city: 'Chennai', name: 'OMR / Perungudi',           lat: 12.9348, lon: 80.2312 },
  { id: 'che_nungam',      city: 'Chennai', name: 'Nungambakkam',              lat: 13.0569, lon: 80.2425 },
  { id: 'che_perambur',    city: 'Chennai', name: 'Perambur / Kolathur',       lat: 13.1139, lon: 80.2360 },
  { id: 'che_sholinganallur', city: 'Chennai', name: 'Sholinganallur',         lat: 12.9010, lon: 80.2279 },
  { id: 'che_porur',       city: 'Chennai', name: 'Porur / Valasaravakkam',    lat: 13.0350, lon: 80.1569 },
  { id: 'che_chrompet',    city: 'Chennai', name: 'Chromepet / Pallavaram',    lat: 12.9516, lon: 80.1462 },
  { id: 'che_ambattur',    city: 'Chennai', name: 'Ambattur',                  lat: 13.1143, lon: 80.1548 },
  { id: 'che_tambaram',    city: 'Chennai', name: 'Tambaram',                  lat: 12.9249, lon: 80.1000 },

  // ── KOLKATA ────────────────────────────────────────────────────────────────
  { id: 'kol_saltlake',    city: 'Kolkata', name: 'Salt Lake Sector V',        lat: 22.5804, lon: 88.4378 },
  { id: 'kol_newtown',     city: 'Kolkata', name: 'New Town / Rajarhat',       lat: 22.5958, lon: 88.4795 },
  { id: 'kol_parkstreet',  city: 'Kolkata', name: 'Park Street / Camac St',    lat: 22.5516, lon: 88.3524 },
  { id: 'kol_ballygunge',  city: 'Kolkata', name: 'Ballygunge / Gariahat',     lat: 22.5280, lon: 88.3655 },
  { id: 'kol_behala',      city: 'Kolkata', name: 'Behala / Joka',             lat: 22.5017, lon: 88.3051 },
  { id: 'kol_dum_dum',     city: 'Kolkata', name: 'Dum Dum / Jessore Road',    lat: 22.6553, lon: 88.4219 },
  { id: 'kol_howrah',      city: 'Kolkata', name: 'Howrah',                    lat: 22.5958, lon: 88.2636 },
  { id: 'kol_lake',        city: 'Kolkata', name: 'Lake Town / Barasat Rd',    lat: 22.5924, lon: 88.4024 },
  { id: 'kol_garia',       city: 'Kolkata', name: 'Garia / Narendrapur',       lat: 22.4618, lon: 88.3946 },
  { id: 'kol_srerampur',   city: 'Kolkata', name: 'Serampore / Chandannagar',  lat: 22.7567, lon: 88.3406 },

  // ── AHMEDABAD ──────────────────────────────────────────────────────────────
  { id: 'ahm_sghighway',   city: 'Ahmedabad', name: 'SG Highway / Bodakdev',   lat: 23.0373, lon: 72.5120 },
  { id: 'ahm_prahlad',     city: 'Ahmedabad', name: 'Prahlad Nagar',           lat: 23.0125, lon: 72.5085 },
  { id: 'ahm_vastrapur',   city: 'Ahmedabad', name: 'Vastrapur',               lat: 23.0350, lon: 72.5293 },
  { id: 'ahm_navrang',     city: 'Ahmedabad', name: 'Navrangpura',             lat: 23.0365, lon: 72.5611 },
  { id: 'ahm_maninagar',   city: 'Ahmedabad', name: 'Maninagar',               lat: 22.9963, lon: 72.6091 },
  { id: 'ahm_chandkheda',  city: 'Ahmedabad', name: 'Chandkheda / Sabarmati',  lat: 23.1025, lon: 72.5869 },
  { id: 'ahm_gota',        city: 'Ahmedabad', name: 'Gota / Motera',           lat: 23.0958, lon: 72.5555 },
  { id: 'ahm_satellite',   city: 'Ahmedabad', name: 'Satellite / Jodhpur',     lat: 23.0218, lon: 72.5212 },
  { id: 'ahm_anand',       city: 'Ahmedabad', name: 'Anand / Nadiad',          lat: 22.5538, lon: 72.9483 },

  // ── CHANDIGARH TRICITY ─────────────────────────────────────────────────────
  { id: 'chd_sec17',       city: 'Chandigarh', name: 'Sector 17 / 35',         lat: 30.7333, lon: 76.7794 },
  { id: 'chd_mohali',      city: 'Mohali', name: 'Mohali Phase 7',             lat: 30.7046, lon: 76.7179 },
  { id: 'chd_panchkula',   city: 'Panchkula', name: 'Sector 20 Panchkula',     lat: 30.6942, lon: 76.8606 },
  { id: 'chd_zirakpur',    city: 'Zirakpur', name: 'Zirakpur',                 lat: 30.6444, lon: 76.8173 },
  { id: 'chd_kharar',      city: 'Kharar', name: 'Kharar',                     lat: 30.7471, lon: 76.6433 },
  { id: 'chd_sec22',       city: 'Chandigarh', name: 'Sector 22 / 34',         lat: 30.7360, lon: 76.7926 },

  // ── JAIPUR ─────────────────────────────────────────────────────────────────
  { id: 'jai_malviya',     city: 'Jaipur', name: 'Malviya Nagar',              lat: 26.8549, lon: 75.8243 },
  { id: 'jai_vaishali',    city: 'Jaipur', name: 'Vaishali Nagar',             lat: 26.9124, lon: 75.7433 },
  { id: 'jai_cscheme',     city: 'Jaipur', name: 'C-Scheme / MI Road',         lat: 26.9110, lon: 75.8056 },
  { id: 'jai_mansarovar',  city: 'Jaipur', name: 'Mansarovar',                 lat: 26.8546, lon: 75.7556 },
  { id: 'jai_jagatpura',   city: 'Jaipur', name: 'Jagatpura / Sitapura',       lat: 26.7982, lon: 75.8455 },
  { id: 'jai_tonk_road',   city: 'Jaipur', name: 'Tonk Road / Pratap Nagar',   lat: 26.8413, lon: 75.8162 },

  // ── LUCKNOW ────────────────────────────────────────────────────────────────
  { id: 'lko_gomti',       city: 'Lucknow', name: 'Gomti Nagar',               lat: 26.8500, lon: 80.9980 },
  { id: 'lko_hazrat',      city: 'Lucknow', name: 'Hazratganj',                lat: 26.8467, lon: 80.9462 },
  { id: 'lko_aliganj',     city: 'Lucknow', name: 'Aliganj / Indira Nagar',    lat: 26.8912, lon: 80.9482 },
  { id: 'lko_mahanagar',   city: 'Lucknow', name: 'Mahanagar',                 lat: 26.8746, lon: 80.9559 },
  { id: 'lko_rae_bareli',  city: 'Lucknow', name: 'Rae Bareli Road',           lat: 26.7887, lon: 80.9861 },
  { id: 'lko_kanpur_road', city: 'Lucknow', name: 'Kanpur Road / Rajajipuram', lat: 26.8384, lon: 80.8913 },

  // ── INDORE ─────────────────────────────────────────────────────────────────
  { id: 'ind_vijay',       city: 'Indore', name: 'Vijay Nagar',                lat: 22.7533, lon: 75.8937 },
  { id: 'ind_palasia',     city: 'Indore', name: 'New Palasia',                lat: 22.7244, lon: 75.8839 },
  { id: 'ind_ab_road',     city: 'Indore', name: 'AB Road / Scheme 54',        lat: 22.7275, lon: 75.9062 },
  { id: 'ind_bhawarkuan',  city: 'Indore', name: 'Bhawarkuan / Mahalakshmi',   lat: 22.7038, lon: 75.8729 },
  { id: 'ind_nipania',     city: 'Indore', name: 'Nipania / Super Corridor',   lat: 22.7735, lon: 75.9502 },

  // ── BHOPAL ─────────────────────────────────────────────────────────────────
  { id: 'bho_mp_nagar',    city: 'Bhopal', name: 'MP Nagar',                   lat: 23.2332, lon: 77.4272 },
  { id: 'bho_arera',       city: 'Bhopal', name: 'Arera Colony',               lat: 23.2115, lon: 77.4333 },
  { id: 'bho_hoshangabad', city: 'Bhopal', name: 'Hoshangabad Road',           lat: 23.1965, lon: 77.4568 },
  { id: 'bho_kolar',       city: 'Bhopal', name: 'Kolar Road',                 lat: 23.1654, lon: 77.4589 },

  // ── NAGPUR ─────────────────────────────────────────────────────────────────
  { id: 'nag_sitabuldi',   city: 'Nagpur', name: 'Sitabuldi / Dharampeth',     lat: 21.1466, lon: 79.0747 },
  { id: 'nag_wardha',      city: 'Nagpur', name: 'Wardha Road / Manewada',     lat: 21.1073, lon: 79.1219 },
  { id: 'nag_amravati_rd', city: 'Nagpur', name: 'Amravati Road',              lat: 21.1831, lon: 79.0107 },
  { id: 'nag_hingna',      city: 'Nagpur', name: 'Hingna Road / Trimurti Nagar', lat: 21.1313, lon: 78.9896 },

  // ── KOCHI ──────────────────────────────────────────────────────────────────
  { id: 'koc_kakkanad',    city: 'Kochi', name: 'Kakkanad / Infopark',         lat: 10.0159, lon: 76.3419 },
  { id: 'koc_edappally',   city: 'Kochi', name: 'Edappally / Lulu Mall',       lat: 10.0261, lon: 76.3086 },
  { id: 'koc_marine',      city: 'Kochi', name: 'Marine Drive / MG Road',      lat: 9.9816,  lon: 76.2799 },
  { id: 'koc_aluva',       city: 'Kochi', name: 'Aluva',                       lat: 10.1004, lon: 76.3583 },
  { id: 'koc_tripunithura',city: 'Kochi', name: 'Tripunithura',                lat: 9.9459,  lon: 76.3490 },

  // ── SURAT ──────────────────────────────────────────────────────────────────
  { id: 'sur_vesu',        city: 'Surat', name: 'Vesu / VIP Road',             lat: 21.1418, lon: 72.7709 },
  { id: 'sur_adajan',      city: 'Surat', name: 'Adajan',                      lat: 21.1959, lon: 72.7933 },
  { id: 'sur_pal',         city: 'Surat', name: 'Pal / Bhatar',                lat: 21.2000, lon: 72.8354 },
  { id: 'sur_katargam',    city: 'Surat', name: 'Katargam',                    lat: 21.2254, lon: 72.8390 },

  // ── VADODARA ───────────────────────────────────────────────────────────────
  { id: 'vad_alkapuri',    city: 'Vadodara', name: 'Alkapuri',                 lat: 22.3119, lon: 73.1723 },
  { id: 'vad_fatehganj',   city: 'Vadodara', name: 'Fatehgunj / Race Course',  lat: 22.3217, lon: 73.1851 },
  { id: 'vad_waghodiya',   city: 'Vadodara', name: 'Waghodiya Road',           lat: 22.3553, lon: 73.2310 },

  // ── COIMBATORE ─────────────────────────────────────────────────────────────
  { id: 'cbe_rspuram',     city: 'Coimbatore', name: 'RS Puram',               lat: 11.0045, lon: 76.9612 },
  { id: 'cbe_gandhipuram', city: 'Coimbatore', name: 'Gandhipuram',            lat: 11.0168, lon: 76.9558 },
  { id: 'cbe_peelamedu',   city: 'Coimbatore', name: 'Peelamedu / Avinashi Rd',lat: 11.0212, lon: 77.0063 },
  { id: 'cbe_hopes',       city: 'Coimbatore', name: 'Hope College / Saravanampatti', lat: 11.0609, lon: 77.0213 },

  // ── VISAKHAPATNAM ──────────────────────────────────────────────────────────
  { id: 'vsk_mvp',         city: 'Visakhapatnam', name: 'MVP Colony',          lat: 17.7384, lon: 83.2861 },
  { id: 'vsk_rushikonda',  city: 'Visakhapatnam', name: 'Rushikonda / Madhurawada', lat: 17.7734, lon: 83.3740 },
  { id: 'vsk_steel',       city: 'Visakhapatnam', name: 'Steel Plant / Ukkunagaram', lat: 17.6835, lon: 83.2089 },
  { id: 'vsk_dwaraka',     city: 'Visakhapatnam', name: 'Dwaraka Nagar',       lat: 17.7225, lon: 83.3039 },

  // ── MYSURU ─────────────────────────────────────────────────────────────────
  { id: 'mys_vijayanagar', city: 'Mysuru', name: 'Vijayanagar',                lat: 12.3052, lon: 76.6553 },
  { id: 'mys_nazarbad',    city: 'Mysuru', name: 'Nazarbad / Jayalakshmipuram',lat: 12.3018, lon: 76.6455 },
  { id: 'mys_kuvempunagar',city: 'Mysuru', name: 'Kuvempunagar',               lat: 12.2958, lon: 76.6388 },

  // ── PATNA ──────────────────────────────────────────────────────────────────
  { id: 'pat_boring',      city: 'Patna', name: 'Boring Road / Kankarbagh',    lat: 25.6074, lon: 85.1266 },
  { id: 'pat_bailey',      city: 'Patna', name: 'Bailey Road / Dak Bungalow',  lat: 25.6199, lon: 85.1356 },
  { id: 'pat_frazer',      city: 'Patna', name: 'Frazer Road / Exhibition Rd', lat: 25.6127, lon: 85.1415 },

  // ── AGRA ───────────────────────────────────────────────────────────────────
  { id: 'agr_civil',       city: 'Agra', name: 'Civil Lines',                  lat: 27.1767, lon: 78.0081 },
  { id: 'agr_foundry',     city: 'Agra', name: 'Foundry Nagar / Kamla Nagar',  lat: 27.2019, lon: 78.0078 },

  // ── LUDHIANA ───────────────────────────────────────────────────────────────
  { id: 'ldh_model',       city: 'Ludhiana', name: 'Model Town',               lat: 30.9078, lon: 75.8622 },
  { id: 'ldh_brs_nagar',   city: 'Ludhiana', name: 'BRS Nagar / Sarabha Nagar',lat: 30.8906, lon: 75.8321 },

  // ── AMRITSAR ───────────────────────────────────────────────────────────────
  { id: 'asr_ranjit',      city: 'Amritsar', name: 'Ranjit Avenue',            lat: 31.6588, lon: 74.8500 },
  { id: 'asr_lawrence',    city: 'Amritsar', name: 'Lawrence Road / Mall Road',lat: 31.6340, lon: 74.8723 },

  // ── DEHRADUN ───────────────────────────────────────────────────────────────
  { id: 'ddn_rajpur',      city: 'Dehradun', name: 'Rajpur Road',              lat: 30.3398, lon: 78.0644 },
  { id: 'ddn_patel_nagar', city: 'Dehradun', name: 'Patel Nagar',              lat: 30.3244, lon: 78.0282 },

  // ── THIRUVANANTHAPURAM ─────────────────────────────────────────────────────
  { id: 'tvm_kowdiar',     city: 'Thiruvananthapuram', name: 'Kowdiar / Vellayambalam', lat: 8.5241, lon: 76.9366 },
  { id: 'tvm_pattom',      city: 'Thiruvananthapuram', name: 'Pattom / Kesavadasapuram', lat: 8.5139, lon: 76.9455 },

  // ── MANGALURU ──────────────────────────────────────────────────────────────
  { id: 'mng_attavar',     city: 'Mangaluru', name: 'Attavar / Kadri',         lat: 12.8726, lon: 74.8421 },
  { id: 'mng_bejai',       city: 'Mangaluru', name: 'Bejai / Kankanady',       lat: 12.8609, lon: 74.8568 },

  // ── VIJAYAWADA ─────────────────────────────────────────────────────────────
  { id: 'vja_governorpet', city: 'Vijayawada', name: 'Governorpet',            lat: 16.5108, lon: 80.6337 },
  { id: 'vja_moghalrajpuram', city: 'Vijayawada', name: 'Moghalrajpuram',      lat: 16.5200, lon: 80.6541 },

  // ── NAVI ADDITIONS (Tier 2 cities) ────────────────────────────────────────
  { id: 'ran_harmu',       city: 'Ranchi', name: 'Harmu / Argora',             lat: 23.3441, lon: 85.3096 },
  { id: 'bhu_bapuji',      city: 'Bhubaneswar', name: 'Bapuji Nagar / Satya Nagar', lat: 20.2961, lon: 85.8189 },
  { id: 'bhu_chandrasekhar',city: 'Bhubaneswar', name: 'Chandrasekharpur',     lat: 20.3087, lon: 85.8198 },
  { id: 'guw_paltan',      city: 'Guwahati', name: 'Paltan Bazar / GS Road',   lat: 26.1445, lon: 91.7362 },
  { id: 'guw_sixmile',     city: 'Guwahati', name: 'Six Mile / Dispur',        lat: 26.1384, lon: 91.7956 },
  { id: 'raj_civil',       city: 'Rajkot', name: 'Civil Hospital / Amin Marg', lat: 22.3039, lon: 70.8022 },
  { id: 'nag_civil_nashik',city: 'Nashik', name: 'Civil Lines / Gangapur Rd',  lat: 20.0059, lon: 73.7903 },
  { id: 'aur_aurangabad',  city: 'Aurangabad', name: 'Kranti Chowk / CIDCO',   lat: 19.8762, lon: 75.3433 },
  { id: 'mys_mysore_road', city: 'Mysuru', name: 'Mysore Road / Alanahalli',   lat: 12.2726, lon: 76.6166 },
  { id: 'jam_gandhi_nagar_jaipur', city: 'Jaipur', name: 'Gandhi Nagar / Sindhi Camp', lat: 26.9171, lon: 75.7876 },
  { id: 'tri_lawspet',     city: 'Puducherry', name: 'Lawspet / Anna Nagar',   lat: 11.9437, lon: 79.8230 },
  { id: 'hub_hubli',       city: 'Hubballi', name: 'Keshwapur / Gokul Road',   lat: 15.3647, lon: 75.1240 },
  { id: 'bel_belgaum',     city: 'Belagavi', name: 'Tilakwadi / Shahapur',     lat: 15.8497, lon: 74.4977 },
];

module.exports = { ALL_LOCATIONS };
