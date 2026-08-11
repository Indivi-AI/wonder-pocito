
export const peopleTransactionsDb = { 
    $schema : {
    people: `
  UNFORMAL SCHEMA for "people" (mix of examples, regex hints, TS-ish intent, all plain text).
  
  Fields
  - id: unique identifier. ex "p1". regex: ^[a-z]\\w{1,31}$
  - name: full name. ex "Sarah Chen"
  - age: integer years. ex 32. regex (if text): ^\\d{1,3}$
  - email: contact email. ex "sarah@company.com". regex: ^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$
  - city: locality. ex "San Francisco"
  - country: country name or code. ex "USA" | "United States"
  - job_title: role/position. ex "Product Manager"
  - company: employer. ex "TechCorp"
  - salary: annual compensation (number). ex 125000. decimal ok.
  - skills: list of abilities. ex ["React","Python","SQL"] (CSV also acceptable)
  - is_active: boolean status. ex true
  - start_date: ISO date "YYYY-MM-DD". ex "2021-03-15"
  - bio: free text (summary)
  - social_links: object
    - linkedin: url/handle. ex "https://linkedin.com/in/sarahchen"
    - github: url/handle. ex "https://github.com/sarahc"
  - projects_completed: count (int). ex 23
  - rating: decimal score 0..5. ex 4.7
  - languages: array of spoken languages. ex ["English","Mandarin"]
  - is_remote: boolean. ex false
  - department: team name. ex "Product"
  - level: seniority. ex "Senior" | "Lead" | "Director" | string
  - certifications: array of strings. ex ["PMP","Scrum Master"]
  - last_promotion: ISO date. ex "2023-01-15"
  
  TypeScript-ish intent (reference only)
  interface Person {
    id: string; name: string; age: number; email: string;
    city?: string; country?: string; job_title?: string; company?: string;
    salary?: number; skills?: string[]; is_active?: boolean;
    start_date?: \`\${number}-\${number}-\${number}\`; bio?: string;
    social_links?: { linkedin?: string; github?: string };
    projects_completed?: number; rating?: number; languages?: string[];
    is_remote?: boolean; department?: string; level?: string;
    certifications?: string[]; last_promotion?: \`\${number}-\${number}-\${number}\`;
  }
  
  Examples
  - Minimal: {id:"p1", name:"Sarah Chen", email:"sarah@company.com"}
  - Full (abridged):
    { id:"p1", name:"Sarah Chen", age:32, email:"sarah@company.com",
      city:"San Francisco", country:"USA", job_title:"Product Manager",
      company:"TechCorp", salary:125000, skills:["React","Python","SQL"],
      is_active:true, start_date:"2021-03-15",
      social_links:{ linkedin:"linkedin.com/in/sarahchen", github:"github.com/sarahc" },
      projects_completed:23, rating:4.7, languages:["English","Mandarin"],
      is_remote:false, department:"Product", level:"Senior",
      certifications:["PMP","Scrum Master"], last_promotion:"2023-01-15" }
  
  Validation hints (optional)
  - date: ^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$
  - rating: ^(?:[0-4](?:\\.\\d+)?|5(?:\\.0+)?)$
  `,
  
    transactions: `
  UNFORMAL SCHEMA for "transactions" (examples + regex + TS-ish cues; permissive on formatting).
  
  Fields
  - id: unique id. ex "tx1". regex: ^tx\\w{1,31}$
  - amount: money (decimal). ex 15750.50. regex: ^\\d+(\\.\\d{1,2})?$
  - currency: ISO-4217. ex "USD". regex: ^[A-Z]{3}$
  - transaction_date: ISO date. ex "2024-11-01"
  - category: purchase type. ex "Software License"
  - customer_id: FK → people.id. ex "p1"
  - description: free text. ex "Annual Pro subscription renewal"
  - payment_method: ex "Credit Card" | "Wire" | "ACH" | "PayPal" | "Cash" | "Check" | string
  - status: ex "pending" | "completed" | "failed" | "refunded" | "void"
  - tags: array of labels. ex ["recurring","enterprise"] (CSV also acceptable)
  - is_refunded: boolean. ex false
  - tax_amount: decimal. ex 1260.04
  - discount_percent: integer 0..100. ex 10. regex: ^([0-9]{1,2}|100)$
  - invoice_number: reference string. ex "INV-2024-1001"
  - due_date: ISO date. ex "2024-11-15"
  - vendor: seller name. ex "SoftwareCorp"
  - location: object
    - city: ex "San Francisco"
    - state: ex "CA"
    - zip: ex "94105" (US ZIP regex: ^\\d{5}(-\\d{4})?$; other formats allowed)
  - line_items: array of objects
    - item: string. ex "Pro License"
    - quantity: int. ex 5
    - unit_price: decimal. ex 2850.00
  - priority: ex "low" | "medium" | "high" | "urgent"
  - created_by: user id (may be people.id). ex "p2"
  - notes: free text
  - quarter: fiscal period. ex "Q4_2024". regex: ^Q[1-4]_\\d{4}$
  
  TypeScript-ish intent (reference only)
  interface LineItem { item: string; quantity: number; unit_price: number }
  interface Transaction {
    id: string; amount: number; currency: string;
    transaction_date: \`\${number}-\${number}-\${number}\`;
    category?: string; customer_id: string; description?: string;
    payment_method?: string; status?: string; tags?: string[];
    is_refunded?: boolean; tax_amount?: number; discount_percent?: number;
    invoice_number?: string; due_date?: \`\${number}-\${number}-\${number}\`;
    vendor?: string; location?: { city?: string; state?: string; zip?: string };
    line_items?: LineItem[]; priority?: string; created_by?: string;
    notes?: string; quarter?: \`Q\${1|2|3|4}_\${number}\`;
  }
  
  Examples
  - Minimal: {id:"tx1", amount:100, currency:"USD", transaction_date:"2024-11-01", customer_id:"p1", status:"completed"}
  - With items:
    { id:"tx1", amount:15750.50, currency:"USD", transaction_date:"2024-11-01",
      category:"Software License", customer_id:"p1",
      description:"Annual Pro subscription renewal", payment_method:"Credit Card",
      status:"completed", tags:["recurring","enterprise"], is_refunded:false,
      tax_amount:1260.04, discount_percent:10, invoice_number:"INV-2024-1001",
      due_date:"2024-11-15", vendor:"SoftwareCorp",
      location:{ city:"San Francisco", state:"CA", zip:"94105" },
      line_items:[ {item:"Pro License", quantity:5, unit_price:2850.00},
                   {item:"Support Package", quantity:1, unit_price:1500.50} ],
      priority:"high", created_by:"p2", notes:"Expedited processing", quarter:"Q4_2024" }
  
  Consistency checks (optional)
  - sum(line_items.quantity * unit_price) ≈ amount - discount + tax (rounding tolerated)
  - is_refunded === true ⇒ status should be "refunded"
  - due_date >= transaction_date (when both exist)
  - customer_id must correspond to an existing people.id
  `
  },
  
  "people": [
    {
      "id": "p1",                           // string - unique identifier
      "name": "Sarah Chen",                 // string - full name
      "age": 32,                           // number - years old
      "email": "sarah@company.com",         // string - contact email
      "city": "San Francisco",             // string - location
      "country": "USA",                    // string - nation
      "job_title": "Product Manager",      // string - role/position
      "company": "TechCorp",               // string - employer
      "salary": 125000,                    // number - annual income
      "skills": ["React", "Python", "SQL"], // array of strings - abilities
      "is_active": true,                   // boolean - status flag
      "start_date": "2021-03-15",          // string - ISO date
      "bio": "Experienced PM passionate about user experience", // string - description
      "social_links": {                    // object - nested data
        "linkedin": "linkedin.com/in/sarahchen",
        "github": "github.com/sarahc"
      },
      "projects_completed": 23,            // number - count
      "rating": 4.7,                      // number - decimal score
      "languages": ["English", "Mandarin"], // array - spoken languages
      "is_remote": false,                  // boolean - work style
      "department": "Product",             // string - team
      "level": "Senior",                   // string - seniority
      "certifications": ["PMP", "Scrum Master"], // array - qualifications
      "last_promotion": "2023-01-15"       // string - date
    },
    {
      "id": "p2",
      "name": "Marcus Rodriguez",
      "age": 28,
      "email": "marcus@startup.io", 
      "city": "Austin",
      "country": "USA",
      "job_title": "Full Stack Developer",
      "company": "InnovateLab",
      "salary": 95000,
      "skills": ["JavaScript", "Node.js", "AWS"],
      "is_active": true,
      "start_date": "2022-08-20",
      "bio": "Coding enthusiast building scalable web applications",
      "social_links": {
        "twitter": "twitter.com/marcusdev",
        "portfolio": "marcusrodriguez.dev"
      },
      "projects_completed": 15,
      "rating": 4.4,
      "languages": ["English", "Spanish"],
      "is_remote": true,
      "department": "Engineering", 
      "level": "Mid",
      "certifications": ["AWS Certified"],
      "last_promotion": "2023-06-10"
    },
    {
      "id": "p3",
      "name": "Aisha Patel",
      "age": 35,
      "email": "aisha@consultancy.com",
      "city": "London", 
      "country": "UK",
      "job_title": "Data Scientist",
      "company": "Analytics Pro",
      "salary": 85000,
      "skills": ["Python", "Machine Learning", "Statistics"],
      "is_active": false,
      "start_date": "2020-02-10",
      "bio": "AI researcher with expertise in predictive modeling",
      "social_links": {
        "research_gate": "researchgate.net/aishapatel"
      },
      "projects_completed": 31,
      "rating": 4.9,
      "languages": ["English", "Hindi", "Gujarati"],
      "is_remote": true,
      "department": "Data Science",
      "level": "Senior",
      "certifications": ["PhD Data Science", "Google Cloud ML"],
      "last_promotion": "2022-11-20"
    }
  ],

  "transactions": [
    {
      "id": "tx1",                         // string - unique ID
      "amount": 15750.50,                  // number - money value with decimals
      "currency": "USD",                   // string - money type
      "transaction_date": "2024-11-01",    // string - when it happened
      "category": "Software License",      // string - type of purchase
      "customer_id": "p1",                // string - who bought it
      "description": "Annual Pro subscription renewal", // string - details
      "payment_method": "Credit Card",     // string - how paid
      "status": "completed",               // string - current state
      "tags": ["recurring", "enterprise"], // array - labels/keywords
      "is_refunded": false,               // boolean - refund status
      "tax_amount": 1260.04,              // number - tax portion
      "discount_percent": 10,             // number - discount applied
      "invoice_number": "INV-2024-1001",  // string - reference
      "due_date": "2024-11-15",           // string - payment deadline
      "vendor": "SoftwareCorp",           // string - seller
      "location": {                       // object - geographic data
        "city": "San Francisco",
        "state": "CA",
        "zip": "94105"
      },
      "line_items": [                     // array of objects - detailed breakdown
        {
          "item": "Pro License",
          "quantity": 5,
          "unit_price": 2850.00
        },
        {
          "item": "Support Package", 
          "quantity": 1,
          "unit_price": 1500.50
        }
      ],
      "priority": "high",                 // string - importance level
      "created_by": "p2",                // string - who entered it
      "notes": "Customer requested expedited processing", // string - comments
      "quarter": "Q4_2024"               // string - fiscal period
    },
    {
      "id": "tx2",
      "amount": 3250.00,
      "currency": "EUR", 
      "transaction_date": "2024-10-28",
      "category": "Consulting",
      "customer_id": "p3",
      "description": "Data analysis project - Phase 1",
      "payment_method": "Wire Transfer",
      "status": "pending",
      "tags": ["project", "analytics"],
      "is_refunded": false,
      "tax_amount": 650.00,
      "discount_percent": 5,
      "invoice_number": "INV-2024-1002", 
      "due_date": "2024-11-30",
      "vendor": "Analytics Pro",
      "location": {
        "city": "London",
        "state": "",
        "zip": "SW1A 1AA"
      },
      "line_items": [
        {
          "item": "Data Modeling",
          "quantity": 40,
          "unit_price": 75.00
        },
        {
          "item": "Report Generation",
          "quantity": 5, 
          "unit_price": 130.00
        }
      ],
      "priority": "medium",
      "created_by": "p1",
      "notes": "Milestone-based payment schedule",
      "quarter": "Q4_2024"
    },
    {
      "id": "tx3",
      "amount": 850.25,
      "currency": "USD",
      "transaction_date": "2024-11-05",
      "category": "Training",
      "customer_id": "p2", 
      "description": "Online course certification",
      "payment_method": "PayPal",
      "status": "completed",
      "tags": ["education", "skills"],
      "is_refunded": false,
      "tax_amount": 68.02,
      "discount_percent": 15,
      "invoice_number": "INV-2024-1003",
      "due_date": "2024-11-05",
      "vendor": "TechEducation",
      "location": {
        "city": "Austin", 
        "state": "TX",
        "zip": "78701"
      },
      "line_items": [
        {
          "item": "Advanced JavaScript Course",
          "quantity": 1,
          "unit_price": 850.25
        }
      ],
      "priority": "low",
      "created_by": "p2",
      "notes": "Self-funded professional development",
      "quarter": "Q4_2024"
    }
  ]
}