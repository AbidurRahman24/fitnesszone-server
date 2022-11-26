const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const fileUpload = require('express-fileupload');
var jwt = require('jsonwebtoken');
const fs = require('fs-extra')
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


app.use(fileUpload());
app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  // console.log(authHeader);
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    // console.log('decoded', decoded);
    req.decoded = decoded;
    next();
  })
}

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.zbtoj.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
      await client.connect();
      const userCollection = client.db('fitnesszone').collection('user')
      const orderCollection = client.db('fitnesszone').collection('order')
      const serviceCollection = client.db('fitnesszone').collection('services')
      const paymentCollection = client.db('fitnesszone').collection('payments')
      const reviewtCollection = client.db('fitnesszone').collection('review')
      
      const verifyAdmin = async (req, res, next) =>{
        const requester = req.decoded.email
        const requesterAccount = await userCollection.findOne({email: requester})
        if(requesterAccount.role === 'admin'){
          next()
        }
        else{
          res.status(403).send({message: 'forbidden'})
        }
      }

      app.post('/login', async (req, res) => {
        const user = req.body
        const token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' });
        res.send({ token })
      })
      // get user
      app.get('/user',verifyJWT, async(req, res)=>{
        const users = await userCollection.find().toArray()
        res.send(users)
      })
      // Admin check
      app.get('/admin/:email', async(req, res)=>{
        const email = req.params.email
        const user = await userCollection.findOne({email: email});
        const isAdmin = user.role === 'admin'
        res.send({admin: isAdmin})
      })
      // put admin
      app.put('/user/admin/:email', verifyJWT, async(req, res) =>{
        const email = req.params.email;
        const requester = req.decoded.email
        const requesterAccount = await userCollection.findOne({email: requester})
        if(requesterAccount.role === 'admin'){

          const filter = {email: email}
          const updateDoc = {
            $set: {role:'admin'},
          }
          const result = await userCollection.updateOne(filter, updateDoc, )
          res.send({result})
        }else{
          res.status(403).send({message: 'forbidden'})
        }
      })
      // put
      app.put('/user/:email', async(req, res) =>{
        const email = req.params.email;
        // console.log(email);
        const user = req.body
        // console.log(user);

        const filter = {email: email}
        const options = {upsert: true};
        const updateDoc = {
          $set: user
        }
        const result = await userCollection.updateOne(filter, updateDoc, options)
        const token = jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '12h'})
        // console.log('result', result);
        res.send({result, token})
      })
  
      app.get('/services', async (req, res) => {
        const query = {};
        const cursor = serviceCollection.find(query);
        const services = await cursor.toArray();
        res.send(services);
      })
  
  
      app.get('/services/:id', async (req, res) => {
        const id = req.params.id
        const query = { _id: ObjectId(id) }
        const result = await serviceCollection.findOne(query)
        res.send(result)
      })

      app.patch('/services/:id', verifyJWT, async(req, res)=>{
        const id = req.params.id;
        const payment = req.body
        const query = {_id: ObjectId(id)}
        const updateDoc ={
          $set:{
            paid: true,
            transectionId: payment.transectionId
          }
        }
        const result = await paymentCollection.insertOne(payment)
        const updateService = await orderCollection.updateOne(query, updateDoc)
        res.send(updateService)
      })
      // payment
      app.post('/create-payment-intent',verifyJWT, async (req, res)=>{
        const service = req.body
        const price = service.price
        const  amount = price* 100
        const paymentIntent = await stripe.paymentIntents.create({
          amount : amount,
          currency: 'usd',
          payment_method_types: ['card']
        })
        res.send({
          clientSecret: paymentIntent.client_secret,
        })
      })
  
  
      // POST
      app.post('/addService',verifyJWT, verifyAdmin, async (req, res) => {
        const service = req.body
       const result = await serviceCollection.insertOne(service)
       res.send(result)
      });
      // admin service load
      app.get('/manageservice', verifyJWT, verifyAdmin, async (req, res) =>{
        const services = await serviceCollection.find().toArray()
        res.send(services)
      })
      // service delete
      app.delete('/manageservice/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: ObjectId(id) };
        const result = await serviceCollection.deleteOne(query);
        res.send(result);
      });
  

      app.delete('/service/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: ObjectId(id) };
        const result = await orderCollection.deleteOne(query);
        res.send(result);
      });
  
  
      // received product via post method
      app.get('/orders', async (req, res) => {
        const query = {};
        const cursor = orderCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
        
      })


      app.get('/myorder', verifyJWT, async(req, res) =>{
        const email = req.query.email
        const decodedemail = req.decoded.email;
        // console.log(email, decodedemail);
        if (email === decodedemail) {
          const query = { email }
          const cursor = orderCollection.find(query)
          const result = await cursor.toArray()
          res.send(result)
        } 
        else {
          res.status(403).send({ message: 'forbidden access' })
        }
      })
      // single order show
      app.get('/order/:id', verifyJWT, async(req, res) =>{
        const id = req.params.id
        const query = {_id: ObjectId(id)}
        const result = await orderCollection.findOne(query)
        res.send(result)
      })


      app.post('/placeOrder', async (req, res) => {
        const received = req.body;
        const result = await orderCollection.insertOne(received);
        res.send(result);
      });

      app.delete('/order/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: ObjectId(id) };
        const result = await orderCollection.deleteOne(query);
        res.send(result);
      });

      // client review
      app.get('/review', async(req, res) =>{
        const query = {};
        const cursor = reviewtCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      })
      app.post('/review', async (req, res) => {
        const received = req.body;
        const result = await reviewtCollection.insertOne(received);
        res.send(result);
      });

    }
    finally {
  
    }
  }
  run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello World!')
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})