const roleMiddleware=(allowedRoles)=>
{
    return (req,res,next)=>{
        if(!req.user)
        {
            return res.status(400).json({message:"Unauthorized access"})
        }

        if(!allowedRoles.includes(req.user.role))
        {
            return res.status(400).json({ message: 'Forbidden: You do not have access' })
        }
       next();
    }
}

module.exports=roleMiddleware;