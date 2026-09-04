"""Seed the additional built-in invitation templates (garden / christening).

These mirror the TEMPLATES catalog in src/lib/templates.js so the template
gallery can serve them from the database alongside wedding / birthday / gala
(seeded in 0009). Idempotent via update_or_create.
"""
from django.db import migrations


BUILT_IN_HEADERS = [
    {
        "slug": "garden",
        "name": "Garden Party",
        "tagline": "Lush · Afternoon",
        "accent_color": "#7A9E6E",
        "background_color": "#0E120C",
        "cover": "/media/6b1ca96ed_generated_image.png",
    },
    {
        "slug": "christening",
        "name": "Christening",
        "tagline": "Joyful · Family",
        "accent_color": "#A8C0D8",
        "background_color": "#0C0F13",
        "cover": "/media/99b0701c8_generated_dae09813.png",
    },
]


def _payload_for(slug):
    """Return the full invitation payload for a built-in template."""
    common = {
        "heroImageMobile": "",
        "countdownVisible": True,
        "heroKicker": "",
        "heroSubline": "",
        "timeNote": "",
        "dressCodeNote": "",
        "detailsNote": "",
        "rsvpNote": "",
        "rsvpMaxGuests": "5",
        "headings": {},
        "sections": [
            {"id": "countdown", "label": "Countdown", "visible": True},
            {"id": "story", "label": "Our Story", "visible": True},
            {"id": "details", "label": "Details", "visible": True},
            {"id": "gallery", "label": "Gallery", "visible": True},
            {"id": "rsvp", "label": "RSVP", "visible": True},
        ],
        "sectionStyles": {},
        "music": {"url": "", "autoplay": True, "loop": True},
        "loopTransition": "cut",
    }
    if slug == "garden":
        return {
            **common,
            "template": "garden",
            "couple": "Maya & Theo",
            "coupleShort": "M·T",
            "eventType": "Garden Party",
            "date": "2027-05-22T16:00",
            "venueName": "The Rose Conservatory",
            "venueAddress": "12 Bloomsbury Lane, San Diego, CA",
            "mapUrl": "https://maps.google.com/?q=The+Rose+Conservatory+San+Diego",
            "time": "4:00 PM",
            "dressCode": "Garden Formal",
            "story": "Two families, one shared love of growing things. A celebration in full bloom.",
            "heroImage": "/media/6b1ca96ed_generated_image.png",
            "storyImage": "/media/83a13c58f_generated_image.png",
            "gallery": [
                {"url": "/media/83a13c58f_generated_image.png", "caption": ""},
                {"url": "/media/6b1ca96ed_generated_image.png", "caption": ""},
            ],
            "accentColor": "#7A9E6E",
            "backgroundColor": "#0E120C",
            "theme": {"textColor": "#F2F0ED", "paperColor": "#F2F0ED", "displayFont": "serif"},
        }
    # christening
    return {
        **common,
        "template": "christening",
        "couple": "The Dela Cruz Family",
        "coupleShort": "B·D",
        "eventType": "Christening",
        "date": "2027-03-14T10:00",
        "venueName": "St. Michael's Parish",
        "venueAddress": "1 Cathedral Plaza, Manila",
        "mapUrl": "https://maps.google.com/?q=St+Michael+Parish+Manila",
        "time": "10:00 AM",
        "dressCode": "Sunday Best",
        "story": "With hearts full of gratitude, we invite you to witness the baptism of our little one.",
        "heroImage": "/media/99b0701c8_generated_dae09813.png",
        "storyImage": "/media/5856fa2b7_generated_5cd6ad13.png",
        "gallery": [
            {"url": "/media/5856fa2b7_generated_5cd6ad13.png", "caption": ""},
            {"url": "/media/99b0701c8_generated_dae09813.png", "caption": ""},
        ],
        "accentColor": "#A8C0D8",
        "backgroundColor": "#0C0F13",
        "theme": {"textColor": "#F2F0ED", "paperColor": "#F2F0ED", "displayFont": "serif"},
    }


def seed_more_templates(apps, schema_editor):
    Template = apps.get_model("core", "Template")
    for header in BUILT_IN_HEADERS:
        Template.objects.update_or_create(
            slug=header["slug"],
            defaults={
                **header,
                "source": "built-in",
                "payload": _payload_for(header["slug"]),
            },
        )


def unseed_more_templates(apps, schema_editor):
    Template = apps.get_model("core", "Template")
    Template.objects.filter(slug__in=[h["slug"] for h in BUILT_IN_HEADERS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_seed_templates"),
    ]

    operations = [
        migrations.RunPython(seed_more_templates, unseed_more_templates),
    ]