// Fictional dataset adapted from the uploaded OntoTrail-Demo-2.html.
export const dataset = {
  "id": "ontotrail-manufacturing-2026-09-18-v2",
  "version": 2,
  "snapshot": "2026-09-18",
  "currency": "INR",
  "site": "Bengaluru Assembly",
  "synthetic": true,
  "suppliers": [
    {
      "id": "SUP-01",
      "name": "Aruna Components",
      "city": "Chennai",
      "partIds": [
        "PT-01"
      ],
      "documentId": "DOC-01"
    },
    {
      "id": "SUP-02",
      "name": "Kaveri Electronics",
      "city": "Bengaluru",
      "partIds": [
        "PT-02"
      ],
      "documentId": "DOC-02"
    },
    {
      "id": "SUP-03",
      "name": "Deccan Precision",
      "city": "Pune",
      "partIds": [
        "PT-03"
      ],
      "documentId": "DOC-03"
    }
  ],
  "parts": [
    {
      "id": "PT-01",
      "name": "Motor controller"
    },
    {
      "id": "PT-02",
      "name": "Sensor assembly"
    },
    {
      "id": "PT-03",
      "name": "Drive housing"
    }
  ],
  "inventory": [
    {
      "id": "INV-PT-01",
      "partId": "PT-01",
      "quantity": 80
    },
    {
      "id": "INV-PT-02",
      "partId": "PT-02",
      "quantity": 140
    },
    {
      "id": "INV-PT-03",
      "partId": "PT-03",
      "quantity": 110
    }
  ],
  "shipments": [
    {
      "id": "SHP-101",
      "supplierId": "SUP-01",
      "partId": "PT-01",
      "quantity": 400,
      "eta": "2026-09-20"
    },
    {
      "id": "SHP-102",
      "supplierId": "SUP-02",
      "partId": "PT-02",
      "quantity": 320,
      "eta": "2026-09-21"
    },
    {
      "id": "SHP-103",
      "supplierId": "SUP-03",
      "partId": "PT-03",
      "quantity": 300,
      "eta": "2026-09-22"
    }
  ],
  "orders": [
    {
      "id": "ORD-1001",
      "customer": "Meridian Mobility",
      "partId": "PT-01",
      "quantity": 60,
      "due": "2026-09-21",
      "unitPricePaise": 650000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1002",
      "customer": "Northstar EV",
      "partId": "PT-01",
      "quantity": 70,
      "due": "2026-09-22",
      "unitPricePaise": 650000,
      "priority": "High"
    },
    {
      "id": "ORD-1003",
      "customer": "Meridian Mobility",
      "partId": "PT-01",
      "quantity": 90,
      "due": "2026-09-24",
      "unitPricePaise": 650000,
      "priority": "High"
    },
    {
      "id": "ORD-1004",
      "customer": "Aster Automotive",
      "partId": "PT-01",
      "quantity": 100,
      "due": "2026-09-27",
      "unitPricePaise": 650000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1005",
      "customer": "Northstar EV",
      "partId": "PT-01",
      "quantity": 80,
      "due": "2026-09-29",
      "unitPricePaise": 650000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1006",
      "customer": "Aster Automotive",
      "partId": "PT-02",
      "quantity": 80,
      "due": "2026-09-22",
      "unitPricePaise": 280000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1007",
      "customer": "Meridian Mobility",
      "partId": "PT-02",
      "quantity": 100,
      "due": "2026-09-24",
      "unitPricePaise": 280000,
      "priority": "High"
    },
    {
      "id": "ORD-1008",
      "customer": "Northstar EV",
      "partId": "PT-02",
      "quantity": 90,
      "due": "2026-09-27",
      "unitPricePaise": 280000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1009",
      "customer": "Aster Automotive",
      "partId": "PT-03",
      "quantity": 60,
      "due": "2026-09-23",
      "unitPricePaise": 420000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1010",
      "customer": "Meridian Mobility",
      "partId": "PT-03",
      "quantity": 100,
      "due": "2026-09-25",
      "unitPricePaise": 420000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1011",
      "customer": "Northstar EV",
      "partId": "PT-03",
      "quantity": 90,
      "due": "2026-09-28",
      "unitPricePaise": 420000,
      "priority": "Standard"
    },
    {
      "id": "ORD-1012",
      "customer": "Aster Automotive",
      "partId": "PT-03",
      "quantity": 80,
      "due": "2026-09-30",
      "unitPricePaise": 420000,
      "priority": "Standard"
    }
  ],
  "documents": [
    {
      "id": "DOC-01",
      "title": "Aruna dispatch advisory",
      "date": "2026-09-18",
      "text": "SHP-101 awaits carrier pickup. Model a delay against the 20 September plan. Recovery quote ALT-01 offers 120 compatible motor controllers delivered 21 September, at an incremental ₹900 per unit. Compatibility is assumed for this synthetic demo.",
      "shipmentId": "SHP-101"
    },
    {
      "id": "DOC-02",
      "title": "Kaveri shipment confirmation",
      "date": "2026-09-18",
      "text": "SHP-102 contains 320 sensor assemblies, scheduled for 21 September delivery.",
      "shipmentId": "SHP-102"
    },
    {
      "id": "DOC-03",
      "title": "Deccan shipment confirmation",
      "date": "2026-09-18",
      "text": "SHP-103 contains 300 drive housings, scheduled for 22 September delivery.",
      "shipmentId": "SHP-103"
    }
  ],
  "recoveryQuotes": [
    {
      "id": "ALT-01",
      "partId": "PT-01",
      "quantity": 120,
      "eta": "2026-09-21",
      "premiumPaise": 90000,
      "documentId": "DOC-01",
      "name": "Approved alternate · motor controller"
    }
  ]
};
