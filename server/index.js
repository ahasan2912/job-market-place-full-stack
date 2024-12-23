const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const port = process.env.PORT || 9000
const app = express()

const corseOption = {
  origin: ['http://localhost:5173'],
  credentials: true
}
app.use(cors(corseOption))
app.use(express.json())
app.use(cookieParser())

const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.PASS_DB}@cluster0.jqnby.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

//verifyToken
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token
  if (!token) return res.status(401).send({ message: 'Unauthorized access' })
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' })
    }
    req.user = decoded
  })
  next()
}

async function run() {
  try {
    const db = client.db('job-market-db')
    const jobsCollection = db.collection('jobs');
    const bidsCollection = db.collection('bids');

    //generate jwt 
    app.post('/jwt', async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, { expiresIn: '10h' })
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ sucess: true })
    })

    //logout and clear cookie from browser
    //get post akta dile hoi
    app.get('/logout', async (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: 'Logout successful' })
    })

    //save a jobData in db
    app.post('/add-job', async (req, res) => {
      const jobData = req.body;
      const result = await jobsCollection.insertOne(jobData);
      res.send(result);
    })

    app.get('/jobs', async (req, res) => {
      const result = await jobsCollection.find().toArray();
      res.send(result);
    })

    //get all job posted by a specific user or mypost data
    app.get('/jobs/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const decodedEmail = req.user?.email
      if (decodedEmail !== email)
        return res.status(401).send({ message: 'unauthorized access' })

      const query = { 'buyer.email': email }
      const result = await jobsCollection.find(query).toArray();
      res.send(result);
    });

    //delete single job form jobs
    app.delete('/job/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.deleteOne(query);
      res.send(result);
    })

    //get a single job data by id //show details
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.findOne(query);
      res.send(result);
    })

    //update job
    app.put('/update-job/:id', async (req, res) => {
      const jobData = req.body;
      const id = req.params.id;
      const updated = {
        $set: jobData,
      }
      const query = { _id: new ObjectId(id) };
      const option = { upsert: true }
      const result = await jobsCollection.updateOne(query, updated, option);
      res.send(result);
    })

    //get all job
    app.get('/all-jobs', async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      const sort = req.query.sort;
      let options = {}
      if (sort) {
        options = { sort: { deadline: sort === 'asc' ? 1 : -1 } }
      }
      // const query = {category: filter}
      let query = {
        title:
        {
          $regex: search,
          $options: 'i',
        },
      };
      if (filter) {
        query.category = filter
      }
      const result = await jobsCollection.find(query, options).toArray();
      res.send(result);
    })

    //save a bidData in db
    app.post('/add-bid', async (req, res) => {
      const bidData = req.body;

      //0. if a user placed a bid already in the job active
      // dui ta aksate pele hbe
      const query = { email: bidData.email, jobId: bidData.jobId }
      const alreadyExist = await bidsCollection.findOne(query);
      if (alreadyExist) return res.status(400).send('You Have already placed a bid on this job!')

      //1. save data in bids collection
      const result = await bidsCollection.insertOne(bidData);

      //2. Increase bid count in jobs collection

      const filter = { _id: new ObjectId(bidData.jobId) };
      const update = {
        $inc: { bid_count: 1 },
      }
      const updateBidCount = await jobsCollection.updateOne(filter, update)
      res.send(result);
    })

    //get all bids for a specific user
    app.get('/bids/:email', verifyToken, async (req, res) => {
      const isBuyer = req.query.buyer
      const email = req.params.email
      const decodedEmail = req.user?.email
      if (decodedEmail !== email)
        return res.status(401).send({ message: 'unauthorized access' })

      let query = {}
      if (isBuyer) {
        query.buyer = email;
      }
      else {
        query.email = email;
      }
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    })

    //get all bids request for a specific user
    /* app.get('/bid-request/:email', async (req, res) => {
      const email = req.params.email;
      const query = { buyer: email }
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    }) */

    //Update bid status
    app.patch('/bid-status-update/:id',verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const email = req.params.email
      const decodedEmail = req.user?.email
      if (decodedEmail !== email)
        return res.status(401).send({ message: 'unauthorized access' })
      const filter = { _id: new ObjectId(id) }
      const updated = {
        $set: { status: status },
      }
      const result = await bidsCollection.updateOne(filter, updated);
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
