from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('scolarite', '0003_classe_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='niveau',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
