fetch('http://localhost:3000/api/route', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startLat: 12.9698,
    startLng: 79.1487, // Vellore (out of bounds)
    endLat: 12.51,
    endLng: 75.01,
    vehicleType: 'standard'
  })
})
.then(res => res.json())
.then(data => console.log('TEST RESULT:', data))
.catch(err => console.error(err));
