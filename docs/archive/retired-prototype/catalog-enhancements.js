(function () {
  if (window.AGROSEED_CONFIG?.features?.demoCatalog !== true) return;

  const categories = [
    { name:'बीज', en:'Seeds', sprite:0, subs:[['सब्ज़ी बीज','Vegetable seeds'],['अनाज बीज','Grain seeds'],['दलहन बीज','Pulse seeds'],['तिलहन बीज','Oilseed varieties'],['फूल बीज','Flower seeds'],['चारा बीज','Fodder seeds'],['बीज कॉम्बो','Seed combos']] },
    { name:'पौधों का पोषण', en:'Plant nutrition', sprite:4, subs:[['NPK और घुलनशील खाद','NPK and water-soluble'],['सूक्ष्म पोषक तत्व','Micronutrients'],['जैव उर्वरक','Biofertilisers'],['मिट्टी सुधारक','Soil conditioners'],['जड़ वृद्धि','Root support'],['पोटाश मिश्रण','Potash blends'],['फसल पोषण स्प्रे','Foliar nutrition']] },
    { name:'फसल सुरक्षा', en:'Crop protection', sprite:7, subs:[['कीट ट्रैप','Pest traps'],['नीम आधारित सुरक्षा','Neem-based care'],['रोग प्रबंधन','Disease management'],['खरपतवार नियंत्रण','Weed control'],['जैविक बचाव','Biological protection'],['स्प्रे बोतलें','Spray bottles'],['सुरक्षा गियर','Protective gear']] },
    { name:'औज़ार', en:'Farm tools', sprite:8, subs:[['हाथ के औज़ार','Hand tools'],['छंटाई औज़ार','Pruning tools'],['खुदाई और रोपाई','Digging and planting'],['हाथ स्प्रेयर','Hand sprayers'],['दस्ताने','Gloves'],['कटाई के औज़ार','Harvest tools'],['माप उपकरण','Measuring tools']] },
    { name:'सिंचाई', en:'Irrigation', sprite:12, subs:[['ड्रिप किट','Drip kits'],['स्प्रिंकलर','Sprinklers'],['पाइप और फिटिंग','Pipes and fittings'],['नोज़ल','Nozzles'],['फिल्टर','Filters'],['पानी टाइमर','Water timers'],['पंप','Pumps']] },
    { name:'जैविक खेती', en:'Organic growing', sprite:5, subs:[['वर्मीकम्पोस्ट','Vermicompost'],['कोकोपीट','Cocopeat'],['नीम खली','Neem cake'],['जैविक पॉटिंग मिक्स','Organic potting mix'],['मल्च शीट','Mulch sheets'],['मिट्टी जांच','Soil testing'],['सीडलिंग ट्रे','Seedling trays']] },
    { name:'नर्सरी', en:'Nursery supplies', sprite:2, subs:[['सीडलिंग ट्रे','Seedling trays'],['ग्रो बैग','Grow bags'],['शेड नेट','Shade nets'],['पौधा सपोर्ट नेट','Plant support nets'],['नर्सरी पॉट','Nursery pots'],['कलम औज़ार','Grafting tools'],['पौधा बांधने की क्लिप','Plant clips']] },
    { name:'खेत मशीनें', en:'Farm equipment', sprite:10, subs:[['बैटरी स्प्रेयर','Battery sprayers'],['सीड ड्रिल','Seed drills'],['पावर स्प्रेयर','Power sprayers'],['पानी पंप','Water pumps'],['पावर वीडर','Power weeders'],['कटाई मशीन','Harvest tools'],['मशीन के पुर्ज़े','Machine parts']] }
  ];
  const rows = [
    [0,0,'लालिमा F1 टमाटर बीज · 10 ग्राम','Lalima F1 Tomato Seeds · 10 g','सहज बीज','Sahaj Seeds',275,345,0,'मौसम की पसंद','Season pick','4.8'],
    [0,0,'तेजधार हरी मिर्च बीज · 10 ग्राम','Tejdhar Green Chilli Seeds · 10 g','बीजशक्ति','BeejShakti',215,275,0,'किसानों की पसंद','Grower favourite','4.6'],
    [0,1,'नर्मदा धान बीज · 1 किलो','Narmada Paddy Seeds · 1 kg','धरती साथी','Dharti Saathi',395,465,1,'नई फसल','New season','4.7'],
    [0,2,'समृद्धि चना बीज · 1 किलो','Samriddhi Chickpea Seeds · 1 kg','अन्नदाता एग्रो','Annadata Agro',690,795,1,'चुना हुआ','Field pick','4.5'],
    [0,3,'सूर्यधारा सरसों बीज · 500 ग्राम','Suryadhara Mustard Seeds · 500 g','बीजशक्ति','BeejShakti',245,299,1,'मौसम की पसंद','Season pick','4.6'],
    [0,4,'रंगोली गेंदा फूल बीज · 5 ग्राम','Rangoli Marigold Seeds · 5 g','पर्ण एग्रो','Parn Agro',95,125,3,'रंग-बिरंगे फूल','Garden favourite','4.8'],
    [0,5,'हरा चारा बरसीम बीज · 1 किलो','Green Berseem Fodder Seeds · 1 kg','धरती साथी','Dharti Saathi',575,660,1,'पशु चारे के लिए','For fodder','4.5'],
    [0,6,'खेत साथी सब्ज़ी बीज कॉम्बो · 12 पैक','Khet Saathi Vegetable Seed Combo · 12 packs','खेत साथी','Khet Saathi',449,599,3,'एक साथ कई विकल्प','Value combo','4.7'],
    [1,0,'संतुलित NPK घुलनशील खाद · 1 किलो','Balanced NPK Water-Soluble Feed · 1 kg','मृदा मित्र','Mrida Mitra',385,455,4,'घुलनशील मिश्रण','Soluble blend','4.7'],
    [1,1,'सूक्ष्म पोषक मिश्रण · 500 ग्राम','Micronutrient Blend · 500 g','हरित धरा','Harit Dhara',215,260,4,'फसल पोषण','Crop nutrition','4.5'],
    [1,2,'जैव सक्रिय मिट्टी कल्चर · 1 किलो','Soil Culture Biofertiliser · 1 kg','प्रकृति खेती','Prakriti Kheti',299,360,5,'मिट्टी के अनुकूल','Soil friendly','4.6'],
    [1,3,'ह्यूमिक एसिड मिट्टी सुधारक · 1 किलो','Humic Soil Conditioner · 1 kg','मृदा मित्र','Mrida Mitra',275,335,4,'मिट्टी की देखभाल','Soil care','4.5'],
    [1,4,'समुद्री शैवाल पौधा टॉनिक · 250 मि.ली.','Seaweed Plant Tonic · 250 ml','ग्रीनरूट','Greenroot',330,399,6,'लोकप्रिय टॉनिक','Popular tonic','4.7'],
    [1,5,'जैव पोटाश मिश्रण · 1 किलो','Bio Potash Blend · 1 kg','धरती साथी','Dharti Saathi',360,425,4,'फसल पोषण','Crop nutrition','4.6'],
    [1,6,'पत्तियों के लिए पोषण स्प्रे · 500 मि.ली.','Foliar Nutrition Spray · 500 ml','हरित धरा','Harit Dhara',245,295,7,'आसान इस्तेमाल','Easy to use','4.4'],
    [2,0,'पीले चिपचिपे कीट ट्रैप · 20 कार्ड','Yellow Sticky Pest Traps · 20 cards','फसल मित्र','Fasal Mitra',195,249,15,'बिना स्प्रे विकल्प','No-spray option','4.8'],
    [2,1,'नीम तेल पौधा सुरक्षा · 500 मि.ली.','Neem Oil Plant Care · 500 ml','प्रकृति खेती','Prakriti Kheti',285,345,6,'नीम आधारित','Neem based','4.6'],
    [2,2,'जैविक फफूंद देखभाल पाउडर · 250 ग्राम','Bio Fungal Care Powder · 250 g','हरित धरा','Harit Dhara',235,289,7,'जैविक विकल्प','Bio option','4.4'],
    [2,3,'हाथ से खरपतवार हटाने का औज़ार','Manual Weeding Tool','किसान वर्क्स','Kisan Works',320,385,9,'खेत का ज़रूरी औज़ार','Field essential','4.5'],
    [2,4,'जैविक कीट देखभाल स्प्रे · 500 मि.ली.','Bio Pest Care Spray · 500 ml','फसल मित्र','Fasal Mitra',199,250,7,'पौधों की देखभाल','Plant care','4.4'],
    [2,5,'नीम आधारित बागवानी स्प्रे · 250 मि.ली.','Neem Garden Spray · 250 ml','ग्रीनरूट','Greenroot',165,210,6,'आसान छिड़काव','Easy spray','4.3'],
    [2,6,'फसल सुरक्षा दस्ताने · एक जोड़ी','Crop Care Gloves · 1 pair','किसान वर्क्स','Kisan Works',145,185,11,'काम के समय सुरक्षा','Workday protection','4.5'],
    [3,0,'मजबूत स्टील खुरपी','Sturdy Steel Hand Hoe','किसान वर्क्स','Kisan Works',245,299,9,'खेत का ज़रूरी औज़ार','Field essential','4.6'],
    [3,1,'बागवानी छंटाई कैंची','Garden Pruning Shears','किसान वर्क्स','Kisan Works',485,575,8,'मजबूत पकड़','Comfort grip','4.7'],
    [3,2,'हाथ की छोटी कल्टीवेटर','Compact Hand Cultivator','खेत साथी','Khet Saathi',195,240,9,'आसान रोपाई','Easy planting','4.4'],
    [3,3,'दबाव वाला हाथ स्प्रेयर · 2 लीटर','Pressure Hand Sprayer · 2 L','फसल मित्र','Fasal Mitra',349,420,10,'घर और खेत के लिए','Home and field','4.5'],
    [3,4,'आरामदायक खेती दस्ताने · एक जोड़ी','Comfort Farm Gloves · 1 pair','किसान वर्क्स','Kisan Works',125,160,11,'आरामदायक पकड़','Comfort grip','4.3'],
    [3,5,'फल और सब्ज़ी कटाई कैंची','Fruit and Vegetable Harvest Snips','अन्नदाता एग्रो','Annadata Agro',275,335,8,'सटीक कटाई','Clean cuts','4.6'],
    [3,6,'मिट्टी नमी मापक','Soil Moisture Meter','मृदा मित्र','Mrida Mitra',595,720,15,'मापकर सिंचाई','Water with care','4.5'],
    [4,0,'छोटे खेत के लिए ड्रिप सिंचाई किट','Drip Irrigation Kit for Small Plots','बूंद एग्रो','Boond Agro',799,990,12,'पानी की बचत','Save water','4.6'],
    [4,1,'360 डिग्री स्प्रिंकलर सेट','360-Degree Sprinkler Set','बूंद एग्रो','Boond Agro',345,420,13,'समान फुहार','Even coverage','4.5'],
    [4,2,'ड्रिप पाइप फिटिंग सेट · 20 पीस','Drip Pipe Fitting Set · 20 pcs','सिंचाई साथी','Sinchai Saathi',225,280,12,'पाइप कनेक्शन','Pipe connection','4.4'],
    [4,3,'पीतल एडजस्टेबल नोज़ल','Brass Adjustable Nozzle','किसान वर्क्स','Kisan Works',260,310,13,'फुहार नियंत्रण','Spray control','4.5'],
    [4,4,'ड्रिप लाइन इनलाइन फिल्टर','Drip Line Inline Filter','बूंद एग्रो','Boond Agro',315,375,12,'लाइन की देखभाल','Line care','4.4'],
    [4,5,'बैटरी पानी टाइमर','Battery Water Timer','सिंचाई साथी','Sinchai Saathi',1150,1390,13,'समय के अनुसार','Timed watering','4.5'],
    [4,6,'मिनी खेत पानी पंप','Mini Farm Water Pump','शक्ति एग्रो','Shakti Agro',2490,2890,12,'खेत के काम के लिए','For field work','4.3'],
    [5,0,'जीवंत वर्मीकम्पोस्ट · 5 किलो','Living Soil Vermicompost · 5 kg','अर्थकाइंड','Earthkind',295,350,5,'मिट्टी की सेहत','Healthy soil','4.9'],
    [5,1,'कोकोपीट ईंट · 5 किलो','Cocopeat Block · 5 kg','मृदा मित्र','Mrida Mitra',245,299,14,'नमी बनाए रखने में मदद','Helps retain moisture','4.6'],
    [5,2,'नीम खली पाउडर · 2 किलो','Neem Cake Powder · 2 kg','प्रकृति खेती','Prakriti Kheti',275,335,5,'जैविक देखभाल','Organic care','4.5'],
    [5,3,'जैविक पॉटिंग मिक्स · 5 किलो','Organic Potting Mix · 5 kg','अर्थकाइंड','Earthkind',325,390,5,'तैयार मिश्रण','Ready mix','4.7'],
    [5,4,'बायोडिग्रेडेबल मल्च शीट','Biodegradable Mulch Sheet','धरती साथी','Dharti Saathi',450,540,14,'खेत की सतह के लिए','For field beds','4.3'],
    [5,5,'मिट्टी जांच बेसिक किट','Basic Soil Test Kit','मृदा मित्र','Mrida Mitra',399,475,15,'मिट्टी समझें','Know your soil','4.4'],
    [5,6,'नर्सरी सीडलिंग ट्रे · 50 सेल','Nursery Seedling Tray · 50 cells','पर्ण एग्रो','Parn Agro',185,229,2,'पौध शुरुआत','Start seedlings','4.6'],
    [6,0,'मजबूत सीडलिंग ट्रे · 98 सेल','Sturdy Seedling Tray · 98 cells','पर्ण एग्रो','Parn Agro',225,275,2,'रोपाई के लिए','For seedlings','4.7'],
    [6,1,'ग्रो बैग सेट · 5 पीस','Grow Bag Set · 5 pcs','नर्सरी मित्र','Nursery Mitra',345,420,5,'बालकनी और खेत के लिए','Home and field','4.5'],
    [6,2,'ग्रीन शेड नेट · 3 × 4 मीटर','Green Shade Net · 3 × 4 m','हरित धरा','Harit Dhara',690,820,11,'नर्सरी उपयोग','Nursery use','4.4'],
    [6,3,'पौधा सपोर्ट नेट · 10 मीटर','Plant Support Net · 10 m','पर्ण एग्रो','Parn Agro',395,475,12,'बेल वाली फसलें','For climbing crops','4.5'],
    [6,4,'रीयूजेबल नर्सरी पॉट · 20 पीस','Reusable Nursery Pots · 20 pcs','नर्सरी मित्र','Nursery Mitra',260,315,2,'बार-बार इस्तेमाल','Reusable','4.3'],
    [6,5,'कलम लगाने का छोटा सेट','Compact Grafting Tool Set','किसान वर्क्स','Kisan Works',425,510,8,'बाग के काम के लिए','For orchard work','4.4'],
    [6,6,'पौधा बांधने की क्लिप · 50 पीस','Plant Support Clips · 50 pcs','पर्ण एग्रो','Parn Agro',120,155,11,'आसान सहारा','Easy support','4.5'],
    [7,0,'बैटरी बैकपैक स्प्रेयर · 16 लीटर','Battery Backpack Sprayer · 16 L','शक्ति एग्रो','Shakti Agro',2890,3390,10,'बड़े खेत के काम के लिए','For field work','4.5'],
    [7,1,'हाथ से चलने वाला सीड ड्रिल','Manual Seed Drill','अन्नदाता एग्रो','Annadata Agro',1190,1450,9,'कतार में बुवाई','Row sowing','4.3'],
    [7,2,'पोर्टेबल पावर स्प्रेयर','Portable Power Sprayer','शक्ति एग्रो','Shakti Agro',3850,4490,10,'खेत उपयोग','Field use','4.4'],
    [7,3,'इलेक्ट्रिक पानी पंप · 0.5 HP','Electric Water Pump · 0.5 HP','बूंद एग्रो','Boond Agro',3450,3990,12,'पानी पहुंचाने के लिए','Water transfer','4.4'],
    [7,4,'मिनी पावर वीडर','Mini Power Weeder','खेत साथी','Khet Saathi',12900,14900,9,'खरपतवार हटाने के लिए','For field upkeep','4.2'],
    [7,5,'फसल काटने का हाथ कटर','Manual Crop Cutter','अन्नदाता एग्रो','Annadata Agro',690,825,8,'कटाई का औज़ार','Harvest tool','4.3'],
    [7,6,'स्प्रेयर नोज़ल और सील सेट','Sprayer Nozzle and Seal Set','शक्ति एग्रो','Shakti Agro',185,230,13,'मशीन के पुर्ज़े','Machine parts','4.4']
  ];
  const fallbackPhotos = ['photo-1592841200221-a6898f307baa','photo-1416879595882-3373a0480b5b','photo-1464226184884-fa280b87c399','photo-1518977676601-b53f82aba655','photo-1501004318641-b39e6451bec6','photo-1589923188900-85dae523342b'];
  const oldMeta = [
    [0,0,0,'Arka Rakshak Tomato Seeds','Sahaj Seeds'],
    [1,3,6,'Neem and Seaweed Soil Tonic','Earthkind'],
    [2,0,15,'Yellow Sticky Pest Cards','Our Selection'],
    [3,1,8,'Garden Pruning Shears','Kisan Works'],
    [0,0,1,'Monsoon Okra Seeds','Sahaj Seeds'],
    [1,2,4,'Bio Potash for Flowering Crops','Greenroot'],
    [4,3,13,'Adjustable Brass Sprinkler Nozzle','Kisan Works'],
    [5,0,5,'Living Soil Compost','Earthkind']
  ];
  function registerPair(hindi, english) {
    HI_TO_EN[hindi] = english;
    EN_TO_HI[english] = hindi;
  }
  categories.forEach(function (category) {
    registerPair(category.name, category.en);
    category.subs.forEach(function (sub) { registerPair(sub[0], sub[1]); });
  });
  oldMeta.forEach(function (meta, index) {
    const product = inventory[index];
    product.category = categories[meta[0]].name;
    product.subcategory = categories[meta[0]].subs[meta[1]][0];
    product.spriteIndex = meta[2];
    product.nameEn = meta[3];
    product.brandEn = meta[4];
    registerPair(product.name, product.nameEn);
    registerPair(product.brand, product.brandEn);
  });
  const extraProducts = rows.map(function (row, index) {
    const category = categories[row[0]];
    const product = {
      id: inventory.length + index + 1,
      category: category.name,
      subcategory: category.subs[row[1]][0],
      name: row[2],
      nameEn: row[3],
      brand: row[4],
      brandEn: row[5],
      price: row[6],
      old: row[7],
      spriteIndex: row[8],
      image: fallbackPhotos[row[8] % fallbackPhotos.length],
      tag: row[9],
      tagEn: row[10],
      rating: row[11],
      isAd: false
    };
    registerPair(product.name, product.nameEn);
    registerPair(product.brand, product.brandEn);
    registerPair(product.tag, product.tagEn);
    return product;
  });
  inventory.push.apply(inventory, extraProducts);
  [
    ['श्रेणियाँ देखें','Shop by category'],['खेत के लिए उत्पाद चुनें','Find supplies for your farm'],
    ['खेत की ज़रूरतें','Farm essentials'],['विश्वसनीय खेती ब्रांड','Trusted farm brands'],
    ['हर श्रेणी में अपनी ज़रूरत का सामान खोजें।','Find what you need across every category.'],
    ['उपश्रेणी चुनें','Choose a subcategory'],['श्रेणी चुनने पर उसके विकल्प यहाँ दिखेंगे।','Choose a category to see its subcategories here.'],
    ['श्रेणी के सभी उत्पाद','All products in this category'],['ब्रांड से खरीदें','Shop by brand'],
    ['किसानों के लिए पसंदीदा ब्रांड','Brands chosen for farm supplies'],['ब्रांड के उत्पाद','Products from this brand'],
    ['सभी ब्रांड','All brands'],['विकल्प','options'],['उत्पाद','products'],['उपलब्ध उत्पाद','products available'],
    ['मुख्य नेविगेशन','Main navigation'],['भेजने के लिए तैयार','Ready to ship'],['प्रायोजित','Sponsored'],
    ['८ श्रेणियाँ · ७ विकल्प प्रति श्रेणी','8 categories · 7 options each'],
    ['उत्पाद दिख रहे हैं','products shown'],['और उत्पाद देखें','Load more products'],['बाकी','left'],
    ['खास छूट','Special offers'],['काम के कुछ बेहतरीन उत्पाद','Good things for the field'],
    ['आपकी खोज से कोई उत्पाद नहीं मिला।','No products matched your search.'],['श्रेणी चुनें','Choose a category'],
    ['होम','Home'],['श्रेणियाँ','Categories'],['मेरे ऑर्डर','My orders'],['सहायता','Support'],['रोहन एआई','Rohan AI'],
    ['ऑर्डर जांचें','Check an order'],['डेमो ऑर्डर आईडी','Demo order ID'],['ऑर्डर की स्थिति देखें','Look up order status'],
    ['यह डेमो पैनल है। असली ऑर्डर जुड़ने पर आपकी खरीदारी यहाँ दिखेगी।','This is a demo panel. Your purchases will appear here when real orders are connected.'],
    ['ऑर्डर की जानकारी अभी उपलब्ध नहीं है।','Order details are not connected yet.'],['अभी कोई डेमो ऑर्डर नहीं है।','No demo orders yet.'],
    ['हम आपकी मदद के लिए यहाँ हैं।','We are here to help.'],['डिलीवरी और ऑर्डर','Delivery and orders'],
    ['उत्पाद सहायता','Product help'],['खाते और भुगतान','Account and payment'],
    ['यह सहायता विकल्प डेमो है। संपर्क सुविधा बाद में जोड़ी जाएगी।','This help option is a demo. Contact support will be connected later.'],
    ['किसान सहायता डेस्क','Farmer support desk'],['कृषि उत्पादों के लिए एक डेमो सहायक','A demo assistant for farm supplies'],
    ['नमस्ते! मैं रोहन एआई का डेमो हूँ।','Hello! I am the Rohan AI demo.'],
    ['यह चैट अभी डेमो है; इसे फसल और उत्पाद जानकारी से जोड़ा जाएगा।','This chat is a demo and will be connected to crop and product information.'],
    ['अपना सवाल लिखें…','Type your question…'],['भेजें','Send'],['बंद करें','Close'],
    ['मौसम में मदद चाहिए?','Need seasonal help?'],['बीज कैसे चुनें?','How do I choose seeds?'],
    ['सुझाव अभी डेमो हैं।','Suggestions are demo only.']
  ].forEach(function (pair) { registerPair(pair[0], pair[1]); });
  const categorySection = document.getElementById('categories');
  categorySection.innerHTML =
    '<div class="section-head"><div><span class="catalog-eyebrow">AGRO SEED · ' + textFor('खेत की ज़रूरतें','Farm essentials') + '</span><h2>श्रेणियाँ देखें</h2><p>हर श्रेणी में अपनी ज़रूरत का सामान खोजें।</p></div><a class="text-link" href="#shop">सभी उत्पाद <span>↗</span></a></div>' +
    '<div class="catalog-category-grid" id="categoryTiles"></div>' +
    '<div class="subcategory-shelf" id="subcategoryShelf"></div>';
  const shopSection = document.getElementById('shop');
  const brandSection = document.createElement('section');
  brandSection.className = 'section brand-section';
  brandSection.id = 'brands';
  brandSection.dataset.demoFeature = 'demoCatalog';
  brandSection.innerHTML =
    '<div class="section-head"><div><span class="catalog-eyebrow">विश्वसनीय खेती ब्रांड</span><h2>ब्रांड से खरीदें</h2><p>अपनी पसंद के ब्रांड के उत्पाद एक जगह देखें।</p></div><a class="text-link" href="#shop">ब्रांड के उत्पाद <span>↗</span></a></div>' +
    '<div class="brand-grid" id="brandGrid"></div>';
  shopSection.parentNode.insertBefore(brandSection, shopSection);
  const filters = document.getElementById('filters');
  filters.innerHTML = '<button class="filter active" data-filter="All">सभी उत्पाद</button>' +
    categories.map(function (category) { return '<button class="filter" data-filter="' + category.name + '">' + category.name + '</button>'; }).join('') +
    '<button class="filter" data-filter="खास छूट">खास छूट</button>';
  const productGrid = document.getElementById('products');
  const catalogMeta = document.createElement('div');
  catalogMeta.className = 'catalog-meta';
  catalogMeta.id = 'catalogMeta';
  productGrid.parentNode.insertBefore(catalogMeta, productGrid);
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'load-more-button';
  moreButton.id = 'loadMoreProducts';
  moreButton.textContent = 'और उत्पाद देखें';
  const sentinel = document.createElement('div');
  sentinel.id = 'productLoadSentinel';
  sentinel.setAttribute('aria-hidden','true');
  productGrid.parentNode.insertBefore(moreButton, productGrid.nextSibling);
  productGrid.parentNode.insertBefore(sentinel, moreButton.nextSibling);
  let activeSubcategory = 'All';
  let activeBrand = 'All';
  let activeCategory = null;
  let visibleCount = 24;
  let currentMatches = [];
  function textFor(hindi, english) { return currentLanguage === 'en' ? english : hindi; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character];
    });
  }
  function spritePosition(index) {
    return {
      x: ((index % 4) * 100 / 3).toFixed(2) + '%',
      y: (Math.floor(index / 4) * 100 / 3).toFixed(2) + '%'
    };
  }
  function spriteSpan(index, label, className) {
    const position = spritePosition(index);
    return '<span class="' + className + '" role="img" aria-label="' + escapeHtml(label) +
      '" style="--sprite-x:' + position.x + ';--sprite-y:' + position.y + '"></span>';
  }
  const brandLogos = {
    'किसान वर्क्स':'assets/brand-logos/kisan-works.svg',
    'पर्ण एग्रो':'assets/brand-logos/parn-agro.svg',
    'मृदा मित्र':'assets/brand-logos/mrida-mitra.svg',
    'अन्नदाता एग्रो':'assets/brand-logos/annadata-agro.svg',
    'अर्थकाइंड':'assets/brand-logos/earthkind.svg',
    'धरती साथी':'assets/brand-logos/dharti-saathi.svg',
    'बूंद एग्रो':'assets/brand-logos/boond-agro.svg',
    'शक्ति एग्रो':'assets/brand-logos/shakti-agro.svg',
    'हरित धरा':'assets/brand-logos/harit-dhara.svg',
    'खेत साथी':'assets/brand-logos/khet-saathi.svg',
    'ग्रीनरूट':'assets/brand-logos/greenroot.svg',
    'प्रकृति खेती':'assets/brand-logos/prakriti-kheti.svg',
    'फसल मित्र':'assets/brand-logos/fasal-mitra.svg',
    'सहज बीज':'assets/brand-logos/sahaj-beej.svg',
    'नर्सरी मित्र':'assets/brand-logos/nursery-mitra.svg',
    'बीजशक्ति':'assets/brand-logos/beejshakti.svg',
    'सिंचाई साथी':'assets/brand-logos/sinchai-saathi.svg',
    'हमारा चयन':'assets/brand-logos/hamara-chayan.svg'
  };
  // Demo variants are placeholders; product.variants can be supplied by the admin/catalog API later.
  const demoVariantOptions = {
    'बीज':[['5 ग्राम','5 g'],['10 ग्राम','10 g'],['25 ग्राम','25 g']],
    'पौधों का पोषण':[['250 ग्राम','250 g'],['500 ग्राम','500 g'],['1 किलो','1 kg']],
    'फसल सुरक्षा':[['100 मि.ली.','100 ml'],['250 मि.ली.','250 ml'],['500 मि.ली.','500 ml']],
    'औज़ार':[['1 पीस','1 piece'],['2 पीस','2 pieces'],['4 पीस','4 pieces']],
    'सिंचाई':[['10 मीटर','10 m'],['25 मीटर','25 m'],['50 मीटर','50 m']],
    'जैविक खेती':[['1 किलो','1 kg'],['5 किलो','5 kg'],['10 किलो','10 kg']],
    'नर्सरी':[['25 पीस','25 pieces'],['50 पीस','50 pieces'],['100 पीस','100 pieces']],
    'खेत मशीनें':[['1 इकाई','1 unit'],['2 इकाई','2 units'],['5 इकाई','5 units']]
  };
  const cardSelections = Object.create(null);
  function variantOptionsFor(product) {
    const source = Array.isArray(product.variants) && product.variants.length ? product.variants : (demoVariantOptions[product.category] || [['1 इकाई','1 unit']]);
    return source.map(function (option) {
      return Array.isArray(option) ? option : [option.labelHi || option.name || '1 इकाई',option.labelEn || option.name || '1 unit'];
    });
  }
  function selectionFor(product, options) {
    if (!cardSelections[product.id]) cardSelections[product.id] = { variantIndex:Math.min(1,options.length-1), quantity:1 };
    return cardSelections[product.id];
  }
  function closeProductPickers(keepOpen) {
    productGrid.querySelectorAll('.pack-picker[open]').forEach(function (picker) {
      if (picker !== keepOpen) picker.open = false;
    });
  }
  function renderCategoryCards() {
    const grid = document.getElementById('categoryTiles');
    grid.innerHTML = categories.map(function (category) {
      const count = inventory.filter(function (product) { return product.category === category.name; }).length;
      return '<button class="catalog-category-card' + (activeCategory === category.name ? ' active' : '') +
        '" type="button" data-category-card="' + escapeHtml(category.name) + '">' +
        spriteSpan(category.sprite, category.name, 'catalog-category-art') +
        '<strong>' + textFor(category.name, category.en) + '</strong>' +
        '<small><b>' + category.subs.length + '</b> <span>विकल्प</span><i>·</i><b>' + count + '</b> <span>उत्पाद</span></small>' +
        '</button>';
    }).join('');
  }
  function renderSubcategories() {
    const shelf = document.getElementById('subcategoryShelf');
    if (!activeCategory) {
      shelf.innerHTML = '<div class="subcategory-intro"><div><strong>' + textFor('उपश्रेणी चुनें','Choose a subcategory') +
        '</strong><small>' + textFor('श्रेणी चुनने पर उसके विकल्प यहाँ दिखेंगे।','Choose a category to see its subcategories here.') +
        '</small></div><span>' + textFor('८ श्रेणियाँ · ७ विकल्प प्रति श्रेणी','8 categories · 7 options each') + '</span></div>';
      return;
    }
    const category = categories.find(function (item) { return item.name === activeCategory; });
    const allLabel = textFor('श्रेणी के सभी उत्पाद','All products in this category');
    shelf.innerHTML = '<div class="subcategory-intro"><div><strong>' + textFor(category.name, category.en) +
      '</strong><small>' + textFor('उपश्रेणी चुनें','Choose a subcategory') + '</small></div><span>' +
      category.subs.length + ' ' + textFor('विकल्प','options') + '</span></div>' +
      '<div class="subcategory-chips"><button class="subcategory-chip' + (activeSubcategory === 'All' ? ' active' : '') +
      '" type="button" data-subcategory="All">' + allLabel + '</button>' +
      category.subs.map(function (sub) {
        return '<button class="subcategory-chip' + (activeSubcategory === sub[0] ? ' active' : '') +
          '" type="button" data-subcategory="' + escapeHtml(sub[0]) + '">' + textFor(sub[0], sub[1]) + '</button>';
      }).join('') + '</div>';
  }
  function brandCounts() {
    return inventory.reduce(function (counts, product) {
      counts[product.brand] = (counts[product.brand] || 0) + 1;
      return counts;
    }, {});
  }
  function renderBrands() {
    const counts = brandCounts();
    const brands = Object.keys(counts).sort(function (a,b) { return counts[b] - counts[a] || a.localeCompare(b,'hi'); });
    document.getElementById('brandGrid').innerHTML = brands.map(function (brand, index) {
      const en = inventory.find(function (product) { return product.brand === brand; }).brandEn || brand;
      return '<button class="brand-card' + (activeBrand === brand ? ' active' : '') +
        '" type="button" data-brand-card="' + escapeHtml(brand) + '">' +
        '<img class="brand-mark" src="' + (brandLogos[brand] || 'assets/brand-logos/hamara-chayan.svg') + '" alt="डमी ब्रांड लोगो: ' + escapeHtml(brand) + '" loading="lazy">' +
        '<span class="brand-card-copy"><strong>' + textFor(brand, en) + '</strong><small><b>' + counts[brand] +
        '</b> <span>उपलब्ध उत्पाद</span></small></span><span class="brand-arrow">↗</span></button>';
    }).join('');
  }
  function syncFilters() {
    document.querySelectorAll('#filters [data-filter]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.filter === activeFilter);
    });
    document.querySelectorAll('[data-category-card]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.categoryCard === activeCategory);
    });
    document.querySelectorAll('[data-brand-card]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.brandCard === activeBrand);
    });
  }
  function renderCatalog() {
    let list = inventory.filter(function (product) {
      const matchesFilter = activeFilter === 'All' ||
        (activeFilter === 'खास छूट' ? product.old > product.price : product.category === activeFilter);
      const matchesSubcategory = activeSubcategory === 'All' || product.subcategory === activeSubcategory;
      const matchesBrand = activeBrand === 'All' || product.brand === activeBrand;
      const haystack = [product.name,product.nameEn,product.brand,product.brandEn,product.category,
        product.subcategory,product.tag,product.tagEn].join(' ').toLowerCase();
      return matchesFilter && matchesSubcategory && matchesBrand && (!query || haystack.includes(query.toLowerCase()));
    });
    const sortMode = document.getElementById('sort').value;
    if (sortMode === 'low') list.sort(function (a,b) { return a.price-b.price; });
    if (sortMode === 'high') list.sort(function (a,b) { return b.price-a.price; });
    currentMatches = list;
    const shown = list.slice(0,visibleCount);
    productGrid.innerHTML = shown.length ? shown.map(function (product) {
      const discount = Math.round((product.old-product.price)/product.old*100);
      const name = currentLanguage === 'en' ? (product.nameEn || HI_TO_EN[product.name] || product.name) : product.name;
      const brand = currentLanguage === 'en' ? (product.brandEn || HI_TO_EN[product.brand] || product.brand) : product.brand;
      const tag = currentLanguage === 'en' ? (product.tagEn || HI_TO_EN[product.tag] || product.tag) : product.tag;
      const category = categories.find(function (item) { return item.name === product.category; });
      const subcategory = category && category.subs.find(function (sub) { return sub[0] === product.subcategory; });
      const subcategoryLabel = subcategory ? textFor(subcategory[0],subcategory[1]) : product.subcategory;
      const variants = variantOptionsFor(product);
      const selection = selectionFor(product,variants);
      const selectedVariant = variants[selection.variantIndex] || variants[0];
      const discountLabel = currentLanguage === 'en' ? discount + '% off' : discount + '% की छूट';
      return '<article class="product"><div class="product-photo">' +
        spriteSpan(product.spriteIndex || 0,name,'catalog-sprite') +
        '<span class="tag">' + escapeHtml(tag) + '</span><span class="discount-badge">' + discountLabel + '</span>' +
        (product.isAd ? '<span class="sponsored-flag">प्रायोजित</span>' : '') +
        '<button class="wish" type="button" aria-label="' + escapeHtml(name + ' को बाद के लिए रखें') + '" data-wish-id="' + product.id + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.8 8.7c0 5-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.7a4.5 4.5 0 0 1 8.8-1.1 4.5 4.5 0 0 1 8.8 1.1Z"/></svg></button></div>' +
        '<div class="product-body"><div class="product-brand">' + escapeHtml(brand) + '</div><h3 class="product-title">' + escapeHtml(name) +
        '</h3><div class="product-subcategory">' + escapeHtml(subcategoryLabel) + '</div><div class="rating"><span class="stars">★★★★★</span> ' +
        product.rating + ' <span>·</span> <span>' + textFor('भेजने के लिए तैयार','Ready to ship') + '</span></div>' +
        '<div class="product-variant-row"><details class="pack-picker" data-demo-feature="demoVariants" data-pack-picker="' + product.id + '"><summary><span>' +
        textFor('पैक','Pack') + '</span><b class="pack-current">' + escapeHtml(textFor(selectedVariant[0],selectedVariant[1])) + '</b></summary>' +
        '<div class="pack-popover"><strong>' + textFor('पैक का आकार','Pack size') + '</strong><div class="pack-options">' +
        variants.map(function (variant,index) { return '<button type="button" class="pack-option' + (index === selection.variantIndex ? ' active' : '') +
          '" data-pack-option="' + index + '" data-product-id="' + product.id + '" aria-pressed="' + (index === selection.variantIndex) + '">' +
          escapeHtml(textFor(variant[0],variant[1])) + '</button>'; }).join('') + '</div><small>' +
        textFor('डेमो विकल्प · बाद में व्यवस्थापक बदल सकेगा','Demo options · configurable by admin') + '</small></div></details>' +
        '<div class="product-quantity"><span>' + textFor('मात्रा','Qty') + '</span><div class="quantity-control"><button type="button" data-quantity-step="-1" data-product-id="' + product.id +
        '" aria-label="' + textFor('मात्रा घटाएँ','Decrease quantity') + '"' + (selection.quantity <= 1 ? ' disabled' : '') + '>−</button><output data-quantity-value="' +
        product.id + '">' + selection.quantity + '</output><button type="button" data-quantity-step="1" data-product-id="' + product.id + '" aria-label="' +
        textFor('मात्रा बढ़ाएँ','Increase quantity') + '">+</button></div></div></div>' +
        '<div class="product-foot"><div class="price">' + rupee(product.price) + ' <small>' + rupee(product.old) + '</small></div>' +
        '<button class="add-to-cart" type="button" data-add-to-cart="' + product.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.2 11.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 9H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/></svg><span>' +
        textFor('कार्ट में जोड़ें','Add to cart') + '</span></button></div></div></article>';
    }).join('') : '<div class="empty">' + textFor('आपकी खोज से कोई उत्पाद नहीं मिला।','No products matched your search.') + '</div>';
    catalogMeta.innerHTML = '<span><b>' + list.length + '</b> ' + textFor('उत्पाद','products') + '</span>' +
      '<small>' + shown.length + ' ' + textFor('उत्पाद दिख रहे हैं','products shown') + '</small>';
    moreButton.hidden = shown.length >= list.length;
    moreButton.textContent = textFor('और उत्पाद देखें','Load more products') +
      (list.length > shown.length ? ' · ' + (list.length-shown.length) + ' ' + textFor('बाकी','left') : '');
    syncFilters();
  }
  function selectCategory(name) {
    activeCategory = name;
    activeFilter = name;
    activeSubcategory = 'All';
    activeBrand = 'All';
    visibleCount = 24;
    renderSubcategories();
    renderCategoryCards();
    renderBrands();
    syncFilters();
    renderCatalog();
    document.getElementById('subcategoryShelf').scrollIntoView({ behavior:'smooth',block:'center' });
  }
  renderCategoryCards();
  renderSubcategories();
  renderBrands();
  window.render = renderCatalog;
  renderCatalog();
  document.getElementById('sort').addEventListener('change',renderCatalog);
  document.getElementById('searchInput').addEventListener('input',function () {
    visibleCount = 24;
    renderCatalog();
  });
  document.querySelectorAll('[data-filter-link]').forEach(function (link) {
    link.addEventListener('click',function () {
      activeCategory = null;
      activeSubcategory = 'All';
      activeBrand = 'All';
      renderSubcategories();
      renderBrands();
      renderCatalog();
    });
  });
  document.getElementById('categoryTiles').addEventListener('click',function (event) {
    const button = event.target.closest('[data-category-card]');
    if (button) selectCategory(button.dataset.categoryCard);
  });
  document.getElementById('subcategoryShelf').addEventListener('click',function (event) {
    const button = event.target.closest('[data-subcategory]');
    if (!button) return;
    activeSubcategory = button.dataset.subcategory;
    renderSubcategories();
    renderCatalog();
    document.getElementById('shop').scrollIntoView({ behavior:'smooth',block:'start' });
  });
  filters.addEventListener('click',function (event) {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeCategory = button.dataset.filter === 'All' || button.dataset.filter === 'खास छूट' ? null : button.dataset.filter;
    activeSubcategory = 'All';
    activeBrand = 'All';
    visibleCount = 24;
    renderSubcategories();
    renderCategoryCards();
    renderBrands();
    renderCatalog();
    if (activeCategory) document.getElementById('subcategoryShelf').scrollIntoView({ behavior:'smooth',block:'center' });
  });
  document.getElementById('brandGrid').addEventListener('click',function (event) {
    const button = event.target.closest('[data-brand-card]');
    if (!button) return;
    activeBrand = button.dataset.brandCard;
    activeFilter = 'All';
    activeCategory = null;
    activeSubcategory = 'All';
    visibleCount = 24;
    renderSubcategories();
    renderCategoryCards();
    renderBrands();
    renderCatalog();
    document.getElementById('shop').scrollIntoView({ behavior:'smooth',block:'start' });
  });
  document.getElementById('clearLink').addEventListener('click',function () {
    activeFilter = 'All';
    activeCategory = null;
    activeSubcategory = 'All';
    activeBrand = 'All';
    visibleCount = 24;
    renderSubcategories();
    renderCategoryCards();
    renderBrands();
    renderCatalog();
  });
  productGrid.addEventListener('click',function (event) {
    const packSummary = event.target.closest('.pack-picker summary');
    if (packSummary) {
      closeProductPickers(packSummary.parentElement);
      return;
    }
    const packOption = event.target.closest('[data-pack-option]');
    if (packOption) {
      const product = inventory.find(function (item) { return item.id === Number(packOption.dataset.productId); });
      if (!product) return;
      const options = variantOptionsFor(product);
      const selection = selectionFor(product,options);
      selection.variantIndex = Math.max(0,Math.min(options.length-1,Number(packOption.dataset.packOption) || 0));
      const card = packOption.closest('.product');
      card.querySelector('.pack-current').textContent = textFor(options[selection.variantIndex][0],options[selection.variantIndex][1]);
      card.querySelectorAll('[data-pack-option]').forEach(function (option) {
        const active = Number(option.dataset.packOption) === selection.variantIndex;
        option.classList.toggle('active',active);
        option.setAttribute('aria-pressed',String(active));
      });
      return;
    }
    const quantityButton = event.target.closest('[data-quantity-step]');
    if (quantityButton) {
      const product = inventory.find(function (item) { return item.id === Number(quantityButton.dataset.productId); });
      if (!product) return;
      const selection = selectionFor(product,variantOptionsFor(product));
      selection.quantity = Math.max(1,Math.min(99,selection.quantity + Number(quantityButton.dataset.quantityStep)));
      const card = quantityButton.closest('.product');
      card.querySelector('[data-quantity-value]').textContent = selection.quantity;
      card.querySelector('[data-quantity-step="-1"]').disabled = selection.quantity <= 1;
      return;
    }
    const addButton = event.target.closest('[data-add-to-cart]');
    if (addButton) {
      const product = inventory.find(function (item) { return item.id === Number(addButton.dataset.addToCart); });
      if (!product) return;
      const options = variantOptionsFor(product);
      const selection = selectionFor(product,options);
      const variant = options[selection.variantIndex] || options[0];
      window.addToCart(product.id,selection.quantity,variant[0]);
      return;
    }
    const wishButton = event.target.closest('[data-wish-id]');
    if (wishButton) {
      wishButton.classList.toggle('saved');
      notify(wishButton.classList.contains('saved') ? 'बाद के लिए सहेज लिया' : 'सहेजे गए उत्पादों से हटाया');
    }
  });
  document.addEventListener('click',function (event) {
    if (event.target.closest('.pack-picker')) return;
    closeProductPickers();
  });
  document.addEventListener('keydown',function (event) {
    if (event.key === 'Escape') closeProductPickers();
  });
  moreButton.addEventListener('click',function () {
    visibleCount += 12;
    renderCatalog();
  });
  const orderPanel = document.createElement('aside');
  orderPanel.className = 'site-panel';
  orderPanel.id = 'orderPanel';
  orderPanel.dataset.demoFeature = 'mockOrderLookup';
  orderPanel.setAttribute('role','dialog');
  orderPanel.setAttribute('aria-modal','true');
  orderPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">AGRO SEED</span><h2>मेरे ऑर्डर</h2></div><button class="panel-close" data-close-panels aria-label="बंद करें">×</button></div>' +
    '<div class="panel-body"><p class="panel-note">यह डेमो पैनल है। असली ऑर्डर जुड़ने पर आपकी खरीदारी यहाँ दिखेगी।</p><form class="order-lookup" id="orderLookupForm"><label for="orderIdInput">ऑर्डर जांचें</label><input id="orderIdInput" placeholder="डेमो ऑर्डर आईडी"><button>ऑर्डर की स्थिति देखें</button></form><div class="order-result" id="orderLookupResult">अभी कोई डेमो ऑर्डर नहीं है।</div></div>';
  const supportPanel = document.createElement('aside');
  supportPanel.className = 'site-panel';
  supportPanel.id = 'supportPanel';
  supportPanel.dataset.demoFeature = 'mockSupport';
  supportPanel.setAttribute('role','dialog');
  supportPanel.setAttribute('aria-modal','true');
  supportPanel.innerHTML = '<div class="panel-head"><div><span class="panel-kicker">AGRO SEED</span><h2>किसान सहायता डेस्क</h2></div><button class="panel-close" data-close-panels aria-label="बंद करें">×</button></div>' +
    '<div class="panel-body"><p class="panel-note">हम आपकी मदद के लिए यहाँ हैं।</p><div class="support-options"><button data-support-answer="delivery">डिलीवरी और ऑर्डर</button><button data-support-answer="product">उत्पाद सहायता</button><button data-support-answer="account">खाते और भुगतान</button></div><div class="order-result" id="supportAnswer">यह सहायता विकल्प डेमो है। संपर्क सुविधा बाद में जोड़ी जाएगी।</div></div>';
  const aiPanel = document.createElement('div');
  aiPanel.className = 'login-modal ai-panel';
  aiPanel.id = 'aiPanel';
  aiPanel.dataset.demoFeature = 'mockAssistant';
  aiPanel.setAttribute('role','dialog');
  aiPanel.setAttribute('aria-modal','true');
  aiPanel.innerHTML = '<button class="panel-close login-close" data-close-panels aria-label="बंद करें">×</button><span class="panel-kicker">AGRO SEED</span><h2>रोहन एआई</h2><p>कृषि उत्पादों के लिए एक डेमो सहायक</p><div class="ai-messages" id="aiMessages"><div class="ai-bubble">नमस्ते! मैं रोहन एआई का डेमो हूँ। यह चैट अभी डेमो है; इसे फसल और उत्पाद जानकारी से जोड़ा जाएगा।</div></div><div class="ai-quick"><button data-ai-question="मौसम में मदद चाहिए?">मौसम में मदद चाहिए?</button><button data-ai-question="बीज कैसे चुनें?">बीज कैसे चुनें?</button></div><form id="aiForm" class="ai-form"><input id="aiInput" placeholder="अपना सवाल लिखें…" autocomplete="off"><button>भेजें</button></form><small class="panel-note">सुझाव अभी डेमो हैं।</small>';
  document.body.appendChild(orderPanel);
  document.body.appendChild(supportPanel);
  document.body.appendChild(aiPanel);
  const baseToggleCart = toggleCart;
  closeUiPanels = function () {
    closeProductPickers();
    document.getElementById('panelOverlay').classList.remove('open');
    document.querySelectorAll('.site-panel.open,.login-modal.open').forEach(function (panel) { panel.classList.remove('open'); });
    document.body.style.overflow = document.getElementById('drawer').classList.contains('open') ? 'hidden' : '';
  };
  openUiPanel = function (panelId) {
    closeProductPickers();
    baseToggleCart(false);
    closeUiPanels();
    document.getElementById('panelOverlay').classList.add('open');
    document.getElementById(panelId).classList.add('open');
    document.body.style.overflow = 'hidden';
  };
  toggleCart = function (open) {
    if (open) {
      closeProductPickers();
      closeUiPanels();
    }
    baseToggleCart(open);
  };
  document.getElementById('panelOverlay').addEventListener('click',closeUiPanels);
  document.querySelectorAll('[data-close-panels]').forEach(function (button) { button.addEventListener('click',closeUiPanels); });
  document.getElementById('orderLookupForm').addEventListener('submit',function (event) {
    event.preventDefault();
    document.getElementById('orderLookupResult').textContent = textFor('ऑर्डर की जानकारी अभी उपलब्ध नहीं है।','Order details are not connected yet.');
  });
  document.getElementById('supportPanel').addEventListener('click',function (event) {
    const button = event.target.closest('[data-support-answer]');
    if (!button) return;
    document.getElementById('supportAnswer').textContent = textFor('यह सहायता विकल्प डेमो है। संपर्क सुविधा बाद में जोड़ी जाएगी।','This help option is a demo. Contact support will be connected later.');
  });
  function sendAiMessage(message) {
    const messages = document.getElementById('aiMessages');
    const user = document.createElement('div');
    user.className = 'ai-user-bubble';
    user.textContent = message;
    const answer = document.createElement('div');
    answer.className = 'ai-bubble';
    answer.textContent = textFor('यह रोहन एआई का डेमो उत्तर है। फसल और उत्पाद की वास्तविक जानकारी जुड़ने पर यहाँ उपयोगी सुझाव मिलेंगे।','This is a demo reply from Rohan AI. Product and crop guidance will appear here once connected.');
    messages.appendChild(user);
    messages.appendChild(answer);
    messages.scrollTop = messages.scrollHeight;
  }
  document.getElementById('aiForm').addEventListener('submit',function (event) {
    event.preventDefault();
    const input = document.getElementById('aiInput');
    if (!input.value.trim()) return;
    sendAiMessage(input.value.trim());
    input.value = '';
  });
  document.getElementById('aiPanel').addEventListener('click',function (event) {
    const button = event.target.closest('[data-ai-question]');
    if (button) sendAiMessage(currentLanguage === 'en' ? (HI_TO_EN[button.dataset.aiQuestion] || button.dataset.aiQuestion) : button.dataset.aiQuestion);
  });
  const farmNav = document.createElement('nav');
  farmNav.className = 'fixed-farm-nav';
  farmNav.dataset.demoFeature = 'demoNavigation';
  farmNav.setAttribute('aria-label','मुख्य नेविगेशन');
  farmNav.innerHTML =
    '<button class="farm-nav-item active" type="button" data-nav-action="home"><span>⌂</span><small>होम</small></button>' +
    '<button class="farm-nav-item" type="button" data-nav-action="categories"><span>▦</span><small>श्रेणियाँ</small></button>' +
    '<button class="farm-nav-item" type="button" data-nav-action="orders"><span>▤</span><small>मेरे ऑर्डर</small></button>' +
    '<button class="farm-nav-item" type="button" data-nav-action="support"><span>☏</span><small>सहायता</small></button>' +
    '<button class="farm-nav-item rohan-nav" type="button" data-nav-action="ai"><span>✦</span><small>रोहन एआई</small></button>';
  document.body.appendChild(farmNav);
  farmNav.addEventListener('click',function (event) {
    const button = event.target.closest('[data-nav-action]');
    if (!button) return;
    farmNav.querySelectorAll('.farm-nav-item').forEach(function (item) { item.classList.toggle('active',item === button); });
    if (button.dataset.navAction === 'home') {
      closeProductPickers();
      closeUiPanels();
      toggleCart(false);
      window.scrollTo({ top:0,behavior:'smooth' });
    }
    if (button.dataset.navAction === 'categories') {
      closeProductPickers();
      closeUiPanels();
      toggleCart(false);
      document.getElementById('categories').scrollIntoView({ behavior:'smooth',block:'start' });
    }
    if (button.dataset.navAction === 'orders') openUiPanel('orderPanel');
    if (button.dataset.navAction === 'support') openUiPanel('supportPanel');
    if (button.dataset.navAction === 'ai') openUiPanel('aiPanel');
  });
  applyDemoFeatureVisibility();
  let autoLoading = false;
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (!entries.some(function (entry) { return entry.isIntersecting; }) || autoLoading || visibleCount >= currentMatches.length) return;
      autoLoading = true;
      visibleCount = Math.min(visibleCount + 12,currentMatches.length);
      renderCatalog();
      window.setTimeout(function () { autoLoading = false; },220);
    },{ rootMargin:'380px 0px',threshold:0 });
    observer.observe(sentinel);
  }
  const baseUpdateLanguage = updateLanguage;
  updateLanguage = function (language) {
    baseUpdateLanguage(language);
    renderCategoryCards();
    renderSubcategories();
    renderBrands();
    renderCatalog();
  };
  applyLanguage(document.body);
})();


