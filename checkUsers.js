const { sequelize, User } = require('./models');

(async () => {
    await sequelize.sync();
    const users = await User.findAll({ attributes: ['id', 'username', 'isAdmin'] });
    console.log(users.map(u => u.toJSON()));
    process.exit();
})();
