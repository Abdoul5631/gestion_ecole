from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluations', '0007_ecole_tenant'),
    ]

    operations = [
        migrations.AddField(
            model_name='calendriercomposition',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='calendrierexamenblanc',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
