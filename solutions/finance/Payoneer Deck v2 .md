1. **The Team**   
   1. Slide from Comax deck   
2. **Wonder \-** Secured, Scalable Multi Tenant BI   
   1. Layout like idf   
   2. Points   
      1. Customized White Label App  
      2. Verified AI  
      3. Secure  
      4. Scalable  
   3. Demo \- the finance applet, embed it in the slide like now   
3. **Deployment Architecture**  
   1. Explanation for coding agent don’t put inside the deck:   
      1. Our architecture is client based. Data is stored in parquets in s3, in a way that is optimized for fast queries. Data processing and viz is done on the client side.   
      2. Security is like this \- user log in, get JWT from Payoneer, trade it with aws cognito for aws jwt, then gets the data directly from s3 \- every user has his own prefix only he can access, enforced by aws without any server.   
   2. Viz \- a simple diagram explaining the architecture  
   3. Chips below the Viz \- when chip is clicked something in the viz is highlighted potentially with some extra text (3-5 words).   
      1. Secure  
      2. Scalable  
      3. Serverless   
4. **Wonder Cube \- semantic data modeling**  
   1. Points and their Viz   
      1. Semantic Layer \- viz: Finance v3 cube profile   
      2. Optimized SQL Queries \- Shai Paruqet layout viz, simplified    
      3. AI Ready  
      4. Dashboards \- Viz Show the dashboard builder selecting metric/dimension in some widget, and they are highlighted in the cube snippet. Goal is to demonstrate how the cube enables BI  
5. **Work Plan**  
   1. Gant slide   
   2. Setup: 2-6 weeks   
      1. Deploy in Payoneer AWS  
      2. Product Customization according to Payoneer requests  
      3. ETLs   
   3. BI Product In Production   
   4. Optional \- AI Insights \- 1-4 Weeks   
      1. Verified Reports  
      2. AI Quality Evaluations 