-- =====================================================
--  PlayMate – Play With Strangers
--  MySQL Database Schema
--  Version: 1.0
-- =====================================================

CREATE DATABASE IF NOT EXISTS playmate_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE playmate_db;

-- ─────────────────────────────────────────────────────
-- TABLE: users
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            VARCHAR(20)   NOT NULL PRIMARY KEY,
    name          VARCHAR(100)  NOT NULL,
    email         VARCHAR(150)  NOT NULL UNIQUE,
    phone         VARCHAR(15)   NOT NULL,
    password_hash VARCHAR(255)  NOT NULL COMMENT 'Store bcrypt hash, never plain text',
    profile_photo LONGTEXT      NULL     COMMENT 'Base64 encoded image or CDN URL',
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_email (email),
    INDEX idx_phone (phone)
) ENGINE=InnoDB COMMENT='Registered players and venue owners';


-- ─────────────────────────────────────────────────────
-- TABLE: venues
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venues (
    id              VARCHAR(20)   NOT NULL PRIMARY KEY,
    owner_id        VARCHAR(20)   NOT NULL,
    name            VARCHAR(150)  NOT NULL,
    sport_type      ENUM(
                      'Football','Cricket','Basketball','Badminton',
                      'Tennis','Volleyball','Table Tennis','Hockey',
                      'Kabaddi','Rugby','Boxing','Cycling','Running','Other'
                    ) NOT NULL DEFAULT 'Other',
    location        VARCHAR(255)  NOT NULL,
    description     TEXT          NULL,
    price_per_slot  DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Price in INR (0 = Free)',
    is_active       TINYINT(1)    NOT NULL DEFAULT 1,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_venue_owner FOREIGN KEY (owner_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_owner    (owner_id),
    INDEX idx_sport    (sport_type),
    INDEX idx_location (location),
    INDEX idx_active   (is_active),
    FULLTEXT INDEX ft_venue_search (name, location, description)
) ENGINE=InnoDB COMMENT='Sports venues listed on PlayMate';


-- ─────────────────────────────────────────────────────
-- TABLE: venue_photos
-- One venue → many photos (stored in order)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_photos (
    id         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
    venue_id   VARCHAR(20)   NOT NULL,
    photo_url  LONGTEXT      NOT NULL COMMENT 'Base64 or CDN URL',
    sort_order INT           NOT NULL DEFAULT 0 COMMENT 'Lower number = shown first',
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_photo_venue FOREIGN KEY (venue_id)
        REFERENCES venues(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_venue_photo (venue_id, sort_order)
) ENGINE=InnoDB COMMENT='Photos for each venue';


-- ─────────────────────────────────────────────────────
-- TABLE: venue_amenities
-- One venue → many amenity tags
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_amenities (
    id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    venue_id   VARCHAR(20)  NOT NULL,
    amenity    VARCHAR(100) NOT NULL,

    CONSTRAINT fk_amenity_venue FOREIGN KEY (venue_id)
        REFERENCES venues(id) ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_venue_amenity (venue_id),
    UNIQUE KEY uq_venue_amenity (venue_id, amenity)
) ENGINE=InnoDB COMMENT='Amenities offered by each venue';


-- ─────────────────────────────────────────────────────
-- TABLE: slots
-- Time slots created by venue owners
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slots (
    id          VARCHAR(20)   NOT NULL PRIMARY KEY,
    venue_id    VARCHAR(20)   NOT NULL,
    slot_date   DATE          NOT NULL,
    start_time  TIME          NOT NULL,
    end_time    TIME          NOT NULL,
    min_members TINYINT       NOT NULL DEFAULT 2  COMMENT 'Min players needed to confirm booking',
    max_members TINYINT       NOT NULL DEFAULT 10 COMMENT 'Max players allowed in this slot',
    price       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status      ENUM('open','locked','cancelled','completed')
                              NOT NULL DEFAULT 'open'
                              COMMENT 'open=accepting players | locked=confirmed | cancelled=not enough players | completed=done',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_slot_venue FOREIGN KEY (venue_id)
        REFERENCES venues(id) ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT chk_members CHECK (min_members <= max_members),
    CONSTRAINT chk_times   CHECK (start_time < end_time),

    INDEX idx_slot_venue  (venue_id),
    INDEX idx_slot_date   (slot_date),
    INDEX idx_slot_status (status)
) ENGINE=InnoDB COMMENT='Available time slots per venue';


-- ─────────────────────────────────────────────────────
-- TABLE: slot_members
-- Junction table — which users joined which slot
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slot_members (
    id        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slot_id   VARCHAR(20)  NOT NULL,
    user_id   VARCHAR(20)  NOT NULL,
    joined_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sm_slot FOREIGN KEY (slot_id)
        REFERENCES slots(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_sm_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,

    UNIQUE KEY uq_slot_user (slot_id, user_id),
    INDEX idx_sm_slot (slot_id),
    INDEX idx_sm_user (user_id)
) ENGINE=InnoDB COMMENT='Players who joined each slot';


-- =====================================================
--  STORED PROCEDURES
-- =====================================================

DELIMITER $$

-- ─────────────────────────────────────────────────────
-- PROCEDURE: join_slot
-- Safely adds a user to a slot and auto-locks when max reached
-- ─────────────────────────────────────────────────────
CREATE PROCEDURE join_slot(
    IN  p_slot_id   VARCHAR(20),
    IN  p_user_id   VARCHAR(20),
    OUT p_result    VARCHAR(100)
)
BEGIN
    DECLARE v_status      VARCHAR(20);
    DECLARE v_current_cnt INT;
    DECLARE v_max         INT;
    DECLARE v_min         INT;
    DECLARE already_in    INT;

    -- Lock the slot row for update
    SELECT status, max_members, min_members
    INTO   v_status, v_max, v_min
    FROM   slots
    WHERE  id = p_slot_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        SET p_result = 'ERROR: Slot not found';
    ELSEIF v_status = 'cancelled' THEN
        SET p_result = 'ERROR: Slot is cancelled';
    ELSEIF v_status = 'locked' THEN
        SET p_result = 'ERROR: Slot is fully booked';
    ELSE
        -- Check if user already joined
        SELECT COUNT(*) INTO already_in
        FROM   slot_members
        WHERE  slot_id = p_slot_id AND user_id = p_user_id;

        IF already_in > 0 THEN
            SET p_result = 'ERROR: Already joined this slot';
        ELSE
            -- Get current member count
            SELECT COUNT(*) INTO v_current_cnt
            FROM   slot_members
            WHERE  slot_id = p_slot_id;

            IF v_current_cnt >= v_max THEN
                SET p_result = 'ERROR: Slot is full';
            ELSE
                -- Insert member
                INSERT INTO slot_members (slot_id, user_id)
                VALUES (p_slot_id, p_user_id);

                SET v_current_cnt = v_current_cnt + 1;

                -- Auto-lock if max reached
                IF v_current_cnt >= v_max THEN
                    UPDATE slots SET status = 'locked' WHERE id = p_slot_id;
                    SET p_result = 'JOINED_AND_LOCKED';
                ELSE
                    SET p_result = 'JOINED';
                END IF;
            END IF;
        END IF;
    END IF;
END$$


-- ─────────────────────────────────────────────────────
-- PROCEDURE: leave_slot
-- Removes a user from a slot (only if not locked)
-- ─────────────────────────────────────────────────────
CREATE PROCEDURE leave_slot(
    IN  p_slot_id  VARCHAR(20),
    IN  p_user_id  VARCHAR(20),
    OUT p_result   VARCHAR(100)
)
BEGIN
    DECLARE v_status VARCHAR(20);

    SELECT status INTO v_status
    FROM   slots
    WHERE  id = p_slot_id
    FOR UPDATE;

    IF v_status IS NULL THEN
        SET p_result = 'ERROR: Slot not found';
    ELSEIF v_status = 'locked' THEN
        SET p_result = 'ERROR: Cannot leave a locked slot';
    ELSE
        DELETE FROM slot_members
        WHERE  slot_id = p_slot_id AND user_id = p_user_id;

        IF ROW_COUNT() = 0 THEN
            SET p_result = 'ERROR: You were not in this slot';
        ELSE
            SET p_result = 'LEFT';
        END IF;
    END IF;
END$$


-- ─────────────────────────────────────────────────────
-- PROCEDURE: cancel_expired_slots
-- Call this via a scheduled event or cron job
-- Cancels open slots whose end time has passed with < min members
-- ─────────────────────────────────────────────────────
CREATE PROCEDURE cancel_expired_slots()
BEGIN
    -- Cancel under-filled slots that are in the past
    UPDATE slots s
    SET    s.status = 'cancelled'
    WHERE  s.status = 'open'
      AND  TIMESTAMP(s.slot_date, s.end_time) < NOW()
      AND  (
             SELECT COUNT(*) FROM slot_members sm
             WHERE  sm.slot_id = s.id
           ) < s.min_members;

    -- Complete slots that had enough members and are now past
    UPDATE slots s
    SET    s.status = 'completed'
    WHERE  s.status = 'open'
      AND  TIMESTAMP(s.slot_date, s.end_time) < NOW()
      AND  (
             SELECT COUNT(*) FROM slot_members sm
             WHERE  sm.slot_id = s.id
           ) >= s.min_members;
END$$

DELIMITER ;


-- =====================================================
--  SCHEDULED EVENT
--  Runs every 15 minutes to auto-cancel/complete slots
-- =====================================================

SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS evt_cancel_expired_slots
    ON SCHEDULE EVERY 15 MINUTE
    STARTS NOW()
    DO
    CALL cancel_expired_slots();


-- =====================================================
--  VIEWS
-- =====================================================

-- ─────────────────────────────────────────────────────
-- VIEW: v_slot_summary
-- Slot info enriched with member counts and venue/owner data
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_slot_summary AS
SELECT
    s.id                                        AS slot_id,
    s.venue_id,
    v.name                                      AS venue_name,
    v.sport_type,
    v.location,
    v.owner_id,
    u.name                                      AS owner_name,
    u.phone                                     AS owner_phone,
    u.email                                     AS owner_email,
    s.slot_date,
    s.start_time,
    s.end_time,
    s.min_members,
    s.max_members,
    s.price,
    s.status,
    COUNT(sm.id)                                AS current_members,
    (s.max_members - COUNT(sm.id))              AS spots_left,
    GREATEST(0, s.min_members - COUNT(sm.id))   AS players_needed,
    TIMESTAMP(s.slot_date, s.end_time)          AS slot_ends_at
FROM slots s
JOIN venues v  ON v.id = s.venue_id
JOIN users  u  ON u.id = v.owner_id
LEFT JOIN slot_members sm ON sm.slot_id = s.id
GROUP BY
    s.id, s.venue_id, v.name, v.sport_type, v.location,
    v.owner_id, u.name, u.phone, u.email,
    s.slot_date, s.start_time, s.end_time,
    s.min_members, s.max_members, s.price, s.status;


-- ─────────────────────────────────────────────────────
-- VIEW: v_slot_members_contact
-- For venue owners: all member contacts per slot
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_slot_members_contact AS
SELECT
    sm.slot_id,
    s.venue_id,
    v.owner_id,
    sm.user_id,
    u.name          AS member_name,
    u.email         AS member_email,
    u.phone         AS member_phone,
    u.profile_photo AS member_photo,
    sm.joined_at,
    s.slot_date,
    s.start_time,
    s.end_time,
    s.status        AS slot_status,
    v.name          AS venue_name
FROM slot_members sm
JOIN users  u  ON u.id  = sm.user_id
JOIN slots  s  ON s.id  = sm.slot_id
JOIN venues v  ON v.id  = s.venue_id;


-- ─────────────────────────────────────────────────────
-- VIEW: v_venue_with_open_slots
-- Venues that currently have at least one open slot
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_venues_with_open_slots AS
SELECT
    v.id,
    v.name,
    v.sport_type,
    v.location,
    v.description,
    v.price_per_slot,
    v.owner_id,
    u.name                AS owner_name,
    COUNT(DISTINCT s.id)  AS open_slot_count
FROM venues v
JOIN users  u ON u.id = v.owner_id
JOIN slots  s ON s.venue_id = v.id AND s.status = 'open'
                 AND TIMESTAMP(s.slot_date, s.end_time) > NOW()
WHERE v.is_active = 1
GROUP BY v.id, v.name, v.sport_type, v.location,
         v.description, v.price_per_slot, v.owner_id, u.name
HAVING open_slot_count > 0;


-- =====================================================
--  SAMPLE / SEED DATA
-- =====================================================

-- Demo Users (passwords are bcrypt hashes of 'demo123')
INSERT INTO users (id, name, email, phone, password_hash, is_active) VALUES
('u_arjun',  'Arjun Mehta',   'arjun@demo.com', '9876543210', '$2b$12$demo_hash_arjun_placeholder',  1),
('u_priya',  'Priya Sharma',  'priya@demo.com', '9123456789', '$2b$12$demo_hash_priya_placeholder',  1),
('u_karan',  'Karan Singh',   'karan@demo.com', '9988776655', '$2b$12$demo_hash_karan_placeholder',  1),
('u_neha',   'Neha Patel',    'neha@demo.com',  '9871234567', '$2b$12$demo_hash_neha_placeholder',   1);


-- Demo Venues
INSERT INTO venues (id, owner_id, name, sport_type, location, description, price_per_slot) VALUES
('v_goalpost',  'u_arjun', 'GoalPost Turf Arena',       'Football',   'Koramangala, Bangalore', 'Premium 5-a-side and 7-a-side football turf with floodlights, changing rooms, and equipment rental.',     500.00),
('v_smash',     'u_priya', 'Smash Point Badminton Club', 'Badminton',  'Indiranagar, Bangalore', 'Olympic-grade synthetic courts with LED lighting. Perfect for casual matches and competitive players.',    300.00),
('v_slam',      'u_karan', 'Slam Dunk Basketball Court', 'Basketball', 'HSR Layout, Bangalore',  'Full-size NBA-standard hardwood basketball court. Open for pickup games and serious training sessions.',   400.00),
('v_cricket',   'u_neha',  'Cricket Premier Ground',     'Cricket',    'Whitefield, Bangalore',  'Well-maintained cricket pitch with nets, practice area, and spectator seating.',                           600.00);


-- Venue Photos
INSERT INTO venue_photos (venue_id, photo_url, sort_order) VALUES
('v_goalpost', 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80', 0),
('v_goalpost', 'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80', 1),
('v_smash',    'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80', 0),
('v_slam',     'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',    0),
('v_cricket',  'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80', 0);


-- Venue Amenities
INSERT INTO venue_amenities (venue_id, amenity) VALUES
('v_goalpost', 'Floodlights'), ('v_goalpost', 'Changing Rooms'), ('v_goalpost', 'Parking'),
('v_goalpost', 'Equipment Rental'), ('v_goalpost', 'Canteen'),
('v_smash',    'LED Lighting'), ('v_smash', 'Shuttle Service'), ('v_smash', 'Racket Rental'),
('v_slam',     'Score Board'), ('v_slam', 'Water Cooler'), ('v_slam', 'Parking'),
('v_cricket',  'Practice Nets'), ('v_cricket', 'Equipment Rental'), ('v_cricket', 'Seating');


-- Slots (dates set relative — adjust as needed)
INSERT INTO slots (id, venue_id, slot_date, start_time, end_time, min_members, max_members, price) VALUES
('s_gp_1',  'v_goalpost', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '06:00:00', '07:00:00', 6, 10, 500.00),
('s_gp_2',  'v_goalpost', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '18:00:00', '19:00:00', 6, 10, 500.00),
('s_gp_3',  'v_goalpost', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '07:00:00', '08:00:00', 6, 14, 500.00),
('s_sm_1',  'v_smash',    DATE_ADD(CURDATE(), INTERVAL 1 DAY), '08:00:00', '09:00:00', 2,  4, 300.00),
('s_sm_2',  'v_smash',    DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00:00', '11:00:00', 2,  4, 300.00),
('s_sl_1',  'v_slam',     DATE_ADD(CURDATE(), INTERVAL 2 DAY), '07:00:00', '08:30:00', 5, 10, 400.00),
('s_sl_2',  'v_slam',     DATE_ADD(CURDATE(), INTERVAL 3 DAY), '17:00:00', '18:30:00', 5, 10, 400.00),
('s_cr_1',  'v_cricket',  DATE_ADD(CURDATE(), INTERVAL 3 DAY), '06:00:00', '08:00:00',10, 22, 600.00),
('s_cr_2',  'v_cricket',  DATE_ADD(CURDATE(), INTERVAL 4 DAY), '16:00:00', '18:00:00',10, 22, 600.00);


-- Sample Joined Members
INSERT INTO slot_members (slot_id, user_id) VALUES
('s_gp_1', 'u_priya'),
('s_gp_1', 'u_karan'),
('s_gp_1', 'u_neha'),
('s_sm_1', 'u_arjun'),
('s_sl_1', 'u_priya'),
('s_sl_1', 'u_neha');


-- =====================================================
--  USEFUL QUERIES
-- =====================================================

-- 1. Get all open slots with venue info (for Browse Venues page)
-- SELECT * FROM v_slot_summary
-- WHERE status = 'open' AND slot_ends_at > NOW()
-- ORDER BY slot_date, start_time;

-- 2. Search venues by sport type
-- SELECT * FROM v_venues_with_open_slots
-- WHERE sport_type = 'Football';

-- 3. Full-text search for venues
-- SELECT * FROM venues
-- WHERE MATCH(name, location, description) AGAINST ('turf bangalore' IN BOOLEAN MODE);

-- 4. Get all member contacts for a slot (owner use only)
-- SELECT * FROM v_slot_members_contact
-- WHERE slot_id = 's_gp_1' AND owner_id = 'u_arjun';

-- 5. Join a slot safely using the stored procedure
-- CALL join_slot('s_gp_1', 'u_arjun', @result);
-- SELECT @result;

-- 6. Get all slots a user has joined
-- SELECT ss.*, v.name AS venue_name, v.location
-- FROM v_slot_summary ss
-- JOIN slot_members sm ON sm.slot_id = ss.slot_id
-- JOIN venues v ON v.id = ss.venue_id
-- WHERE sm.user_id = 'u_arjun';

-- 7. Get all venues owned by a user
-- SELECT v.*, COUNT(DISTINCT s.id) AS total_slots,
--        SUM(CASE WHEN s.status='open' THEN 1 ELSE 0 END) AS open_slots
-- FROM venues v
-- LEFT JOIN slots s ON s.venue_id = v.id
-- WHERE v.owner_id = 'u_arjun'
-- GROUP BY v.id;

-- 8. Manually trigger slot expiry check
-- CALL cancel_expired_slots();
