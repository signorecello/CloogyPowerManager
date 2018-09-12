# CloogyPowerManager

## What is it?
Cloogy Power Manager is a hobby app from a javascript beginner. It monitors a plug for its power, and if your consumption is greater than your available power, it turns off the plug for as long as needed.

## Why do I need it?
I needed to charge my car (about 2kw) but the available power in my house wasn't enough to cope with the car + dishwasher. So instead of having my home power raised which would cost me money, I just started this little project.

## What should I have?
You need a Cloogy Kit. Other kits should work too if you can get their API and do some work on your own.

## Does it work out-of-the box?
Quick answer: NO. You need to set up some stuff. 

    1.º You need to set some enviroment variables like those in the .env.example 
    2.º You need to find your unit's and tag's ID. Just clone the repository, comment out the last function and call grabbers.getTags(). Then search for your tags. Use those tags when calling sendFeedRequestAndParse().

I'm sure there's a way to make this work out-of-the box, but as I said, I'm just a beginner... I'd appreciate your help if you can!

## Any other recommendations?
If you run this on your own PC you may be spending more in energy than in the power raise. BUT just use Heroku or AWS or an old raspberry PI and you should be fine.

Also, be careful because you may REALLY need that plug ON all the time.

## <center>I need to thank [Thomas88](https://github.com/thomas88) and [EnergieID](https://github.com/EnergieID) for their codes. I learned A LOT reading from them (thank god I knew a little python)

# <center>ENJOY</center>