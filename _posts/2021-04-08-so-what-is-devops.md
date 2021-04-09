---
title: 'So, what IS DevOps'
type: 'Post'
date: 2021-04-08 20:00:00
description: |
DevOps is the ability to bring new software to market faster.
  •	DevOps exists to help the business win.<br/>
  •	The scope is broad, but centered on IT.<br/>
  •	The foundations are found in Agile and Lean.<br/>
  •	Culture is very important.<br/>
  •	Feedback is fuel for innovation.<br/>
  •	Automation helps.
featured_image: '/images/posts/20210408/featured.jpg'
comments: true
addthis: true
---

Before getting into post’s matter, I am going to give a brief explanation about Why I'm writing this article series and, the reason can not be simpler: a lot of people post about the shiniest and fanciest technological stuff available, e.g. Kubernetes operators, No Ops, Service Mesh, and the list goes on and on; but there are some people who still doesn’t know how to properly stablish and govern a reliable Software Development Lifecycle (SDLC), or simply arrived late to this party. So, I'll write about the trending topics and also, about some fundamentals in order to help people get up to speed.

Besides that, some of my “technical citizens” friends asked me to explain them, with just enough deep, what is this whole DevOps movement about, and that is what I propose to do. You can find the first article of this series in [here](/blog/2021/04/04/devops-what-is-not/)

### <span style="color:#4888bc">What is DevOps?</span>
> DevOps (a clipped compound of “development” and “operations”) is a software engineering culture and practice that aims at unifying software development (Dev) and software operation (Ops). The main characteristic of the DevOps movement is to strongly advocate automation and monitoring at all streps of software construction, from integration, testing, releasing to deployment and infrastructure management. DevOps aims at shorter development cycles, increased deployment frequency, and more dependable release, in close alignment with business objectives. (Mala, 2019)

Do you want it really short? **DevOps is the ability to bring new software to market faster.**

Truth be told everyone supplies slightly different words, but the same working understanding of DevOps is nearly Universal. There is the “CAMS” (Culture, Automation, Measuring and Sharing) acronym popularized by John Willis and Damon Edwards. CAMS has been extended repeatedly, first by Jez Humble adding an “L” for lean so, “CALMS” and, more recently; by Eveline Oehrlich of Forrester who is discussing [CALMSS](https://go.forrester.com/blogs/15-03-02-devops_now_with_calmss/).

Anyway, analysts, authors, industry, and community leaders all agree in the following big and mutually supportive ideas:
* DevOps exists to help the business win.
* The scope is broad, but centered on IT.
* The foundations are found in Agile and Lean.
* Culture is very important.
* Feedback is fuel for innovation.
* Automation helps.

Before entering in detail on each point, please look the following TED talk, is one of my all-time favorites.
<iframe src="https://www.youtube.com/embed/7zFeuSagktM" width="640" height="360" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>

#### <span style="color:#4888bc">Why: To help the business win</span>

Damon Edwards told it rightly: DevOps is not about a technology; DevOps is about a business problem. The Theory of Constraints (TOC) tell us that *“a chain is no stronger than its weakest link”*, so we must optimize the whole and not just individual ‘silos’.

Today, especially when the whole planet is fighting an invisible and relentless enemy, technology is critically important to how a wide variety of companies compete. DevOps is a response to what the IT has come to be: from the nerdy guys needed to “keep the lights on” to key part in how the business competes every day.

If you disagree with me: try to run any company on major industry without a single piece of technology; I dare you, I double dare you.

#### <span style="color:#4888bc">Who: A Broad Scope, beyond development and operations</span>
The classic DevOps concern is that famous Wall of Confusion between development and operations, but; with the focus on business value, the scope must include everyone who is involved in taking an idea through IT to business value.

<img src="/images/posts/20210408/teamalphasuperawesome.jpg" width="640">

In recent years, there has been something of a cottage industry of community leaders and analysts writing: “No, no, it really should be “Dev____Ops” with the blank filled in by their on specialty. Examples: DevTestOps, DevSecOps, DevAIOps, DevUXOps, and so on.

Narrowing the idea here: **DevOps is about collaboration and optimization across the WHOLE organization**, even beyond IT (HR, Finance, …) and company borders (Suppliers).

#### <span style="color:#4888bc">Based On: Agile and Lean</span>
Agile’s shift towards a faster delivery of software and focus on the end goals making it a natural “spiritual ancestor” for DevOps. However, from the perspective of Ops teams, Agile represented Hannibal at the gates of Rome.

Agile was used in development side of the house, enabling it to create something the business wanted faster but with operations still moving at waterfall suited pace, pressures grew and the need for something like DevOps became clear.

A note aside here: Where much of DevOps energy seems to come from its Agile roots, the intellectual side of the movement is more rooted in Lean.

#### <span style="color:#4888bc">Culture: Collaboration and Experimentation</span>
Lean and Agile are both focused on people first, systems second and heavily cross-train or work in cross-functional teams. They also emphasize continual improvement (kaizen) through approaches like retrospectives.

The other cultural emphasis is a push towards experimentation, constant learning, and improvement. This is Gene Kim’s “Third Way” of DevOps.

<figure>
<a href="https://itrevolution.com/the-three-ways-principles-underpinning-devops/" target="_blank"><img src="/images/posts/20210408/3ways.png"></a>
<figcaption>The Three Ways: The Principles Underpinning DevOps - Gene Kim, 2012</figcaption>
</figure>

#### <span style="color:#4888bc">Feedback: The more, the better</span>
Experimentation, adaptation, and learning tend to do better when there is ample feedback. Otherwise, there is too little to learn from. Amplifying feedback loops is Gene’s “Second Way”. The “CAMS” concepts of measurement and sharing point to feedback. You gather lots of information, and make sure people see it so they have an opportunity to learn from it.

In a collaborative culture with ample sharing the feedback must cross the traditional silo lines. That means the awesome production monitoring that had lived in Ops land, is radiated back to ~~development~~ everybody else.

#### <span style="color:#4888bc">Automation: Of course!</span>
The “A” in CAMS is automation. A Lean initiative like Value Stream Mapping (VSM), looking at IT will find waste in wait times, errors, and more and move towards automation as a natural result. Feedback craves automated deployment of changes, and automated tests or production monitoring that validates them. Automation is what makes a lot of DevOps possible. It does not make cooperation between development and operations happen, but tensions are reduced when Ops gets out of the business of arguing about the SLA, they have with Dev around server provisioning and instead provide Dev a button to press.

More important, every automated process is based on code, code is versioned in a repository and maintained by a team who improves the functionality constantly, additionally this code is programmed in defensive way so is idempotent: does not matter how many times you execute it, the results are the expected ones.

Remember: **DevOps is not about automation. Automation is just the natural result of DevOps.**
