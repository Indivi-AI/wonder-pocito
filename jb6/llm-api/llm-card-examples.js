import { dsls } from '@jb6/core'

const {
    'llm-api': { Prompt,
        prompt: { prompt, user, system},
    },
    
} = dsls

Prompt('tailwindChartGuide', {
    impl: prompt(
      system(`# Essential HTML + Tailwind Patterns for LLMs
## 🎯 Chart Pattern - Copy & Modify
### Base Structure (NEVER CHANGE)
<div class="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
  <h2 class="text-2xl font-bold text-center mb-6">TITLE HERE</h2>
  <div class="space-y-4">
    <!-- Bars go here -->
  </div>
</div>
### Single Bar Pattern (SAFE TO COPY)
<div class="flex items-center">
  <div class="w-24 text-sm">LABEL</div>
  <div class="flex-1 bg-gray-200 rounded-full h-6 ml-4">
    <div class="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2" style="width: 75%;">
      <span class="text-white text-xs font-medium">VALUE</span>
    </div>
  </div>
</div>

### Complete Example
<div class="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
  <h2 class="text-2xl font-bold text-center mb-6">Sales by Region</h2>
  <div class="space-y-4">
    
    <div class="flex items-center">
      <div class="w-24 text-sm">North America</div>
      <div class="flex-1 bg-gray-200 rounded-full h-6 ml-4">
        <div class="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2" style="width: 100%;">
          <span class="text-white text-xs font-medium">$580K</span>
        </div>
      </div>
    </div>
    
    <div class="flex items-center">
      <div class="w-24 text-sm">Europe</div>
      <div class="flex-1 bg-gray-200 rounded-full h-6 ml-4">
        <div class="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2" style="width: 83%;">
          <span class="text-white text-xs font-medium">$480K</span>
        </div>
      </div>
    </div>
    
    <div class="flex items-center">
      <div class="w-24 text-sm">Asia</div>
      <div class="flex-1 bg-gray-200 rounded-full h-6 ml-4">
        <div class="bg-yellow-500 h-6 rounded-full flex items-center justify-end pr-2" style="width: 76%;">
          <span class="text-white text-xs font-medium">$440K</span>
        </div>
      </div>
    </div>
    
  </div>
</div>

## 🔧 What You Can Change
### Colors (SAFE)
bg-red-500 bg-blue-500 bg-green-500 bg-yellow-500 
bg-purple-500 bg-pink-500 bg-indigo-500 bg-gray-500

### Bar Height (SAFE)
h-4 h-6 h-8 h-10

### Chart Width (SAFE) 
max-w-sm max-w-xl max-w-2xl max-w-4xl max-w-6xl

### Background (SAFE)
bg-white bg-gray-50 bg-blue-50
bg-gradient-to-r from-blue-100 to-purple-100

## 📐 Essential Classes
### Flexbox (USE EXACTLY)
flex items-center
flex-1
justify-center justify-end
space-x-4 space-y-4

### Sizing (SAFE)
w-24 w-full h-6 p-6 px-4 py-2 m-4 ml-4 mb-6

### Text (SAFE)
text-sm text-xl text-2xl font-bold font-medium 
text-center text-white text-gray-600

### Borders (SAFE)
rounded-lg rounded-full shadow-lg border

## 🚫 Never Change These

flex items-center               <!-- For horizontal alignment -->
flex-1 bg-gray-200 rounded-full <!-- Bar background track -->
space-y-4                       <!-- Vertical spacing -->

## 📊 Other Patterns
### Card
<div class="bg-white rounded-lg shadow-lg p-6">
  <h3 class="text-xl font-bold mb-4">Title</h3>
  <p class="text-gray-600">Content</p>
</div>

### Progress Bar
<div class="w-full bg-gray-200 rounded-full h-4">
  <div class="bg-blue-500 h-4 rounded-full" style="width: 45%;"></div>
</div>

### Button
<button class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
  Click Me
</button>

### Alerts
<div class="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded">
  Info message
</div>
<div class="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
  Error message
</div>

### Grid Layout
<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
  <div>Left column</div>
  <div>Right column</div>
</div>

## 🎨 Working Color Combinations

<!-- Professional blue -->
bg-blue-500 bg-blue-600 bg-blue-50 text-blue-800
<!-- Success green -->
bg-green-500 bg-green-50 text-green-800
<!-- Warning yellow -->
bg-yellow-500 bg-yellow-50 text-yellow-800

## 🔥 Critical Tips
1. **Always keep 'flex items-center'** - prevents layout breaks
2. **Use 'rounded-full'** for modern bars
3. **Stick to '500' variants** - good contrast
4. **Use 'text-xs'** for bar labels - prevents overflow
5. **Keep percentage widths** - bars scale properly
## ⚡ Quick Customization Recipe
1. **Copy the complete example above**
2. **Change only these parts:**
   - Title: 'Sales by Region' → 'Your Title'
   - Labels: 'North America' → 'Your Labels'
   - Values: '$580K' → 'Your Values'
   - Colors: 'bg-blue-500' → 'bg-purple-500'
   - Widths: 'width: 100%' → 'width: 85%'
   That's it! Everything else should stay the same for best results.`))
})