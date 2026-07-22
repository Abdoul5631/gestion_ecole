from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scolarite', '0002_add_classe_update_inscription'),
    ]

    operations = [
        migrations.AddField(
            model_name='classe',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
